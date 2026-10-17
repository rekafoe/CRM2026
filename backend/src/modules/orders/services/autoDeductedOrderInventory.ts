import type { getDb } from '../../../config/database'
import { MaterialTransactionService } from '../../warehouse/services/materialTransactionService'

type Db = Awaited<ReturnType<typeof getDb>>

export type InventoryComponent = { materialId: number; qtyPerItem: number }

function isMeterUnit(unitRaw: unknown): boolean {
  const unit = String(unitRaw || '').trim().toLowerCase()
  return unit === 'м' || unit === 'пог.м' || unit === 'пог. м' || unit.includes('метр')
}

/** Same rounding as CRM reservation / spend paths (meters: 2dp, else ceil). */
export function computeInventoryNeed(
  qtyPerItemRaw: unknown,
  orderQtyRaw: unknown,
  unitRaw?: unknown,
): number {
  const qtyPerItem = Math.max(0, Number(qtyPerItemRaw) || 0)
  const orderQty = Math.max(1, Number(orderQtyRaw) || 1)
  const total = qtyPerItem * orderQty
  if (isMeterUnit(unitRaw)) {
    return Math.round(total * 100) / 100
  }
  return Math.ceil(total)
}

export async function orderHasWarehouseSpend(db: Db, orderId: number): Promise<boolean> {
  const row = await db.get<{ ok: number }>(
    `SELECT 1 AS ok
       FROM material_moves
      WHERE order_id = ? AND delta < 0
      LIMIT 1`,
    [orderId],
  )
  return row != null
}

/** Drop active CRM holds so accept-to-work cannot spend again after auto-deduction. */
export async function cancelActiveReservationsForOrder(db: Db, orderId: number): Promise<number> {
  const table = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='material_reservations'`,
  )
  if (!table) return 0
  const result = await db.run(
    `UPDATE material_reservations
        SET status = 'cancelled'
      WHERE order_id = ?
        AND status IN ('active', 'reserved')`,
    [orderId],
  )
  return Number(result?.changes || 0)
}

export function readStoredDeductionComponents(
  params: Record<string, unknown>,
): InventoryComponent[] {
  const fromMiniapp = Array.isArray(params._miniappComponents) ? params._miniappComponents : null
  const fromCrm = Array.isArray(params.components) ? params.components : null
  const raw = fromMiniapp && fromMiniapp.length > 0 ? fromMiniapp : fromCrm || []
  return raw
    .map((component: Record<string, unknown>) => ({
      materialId: Number(component.materialId),
      qtyPerItem: Number(component.qtyPerItem),
    }))
    .filter(
      (component) =>
        Number.isFinite(component.materialId) &&
        component.materialId > 0 &&
        Number.isFinite(component.qtyPerItem) &&
        component.qtyPerItem > 0,
    )
}

export async function loadMaterialUnits(
  db: Db,
  materialIds: number[],
): Promise<Map<number, string | null>> {
  const ids = [...new Set(materialIds.filter((id) => Number.isFinite(id) && id > 0))]
  const map = new Map<number, string | null>()
  if (ids.length === 0) return map
  const rows = await db.all<Array<{ id: number; unit?: string | null }>>(
    `SELECT id, unit FROM materials WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  )
  for (const row of rows || []) {
    map.set(Number(row.id), row.unit ?? null)
  }
  return map
}

export function aggregateComponentNeeds(
  components: InventoryComponent[],
  quantity: number,
  unitsByMaterialId: Map<number, string | null>,
): Map<number, number> {
  const needs = new Map<number, number>()
  for (const component of components) {
    const need = computeInventoryNeed(
      component.qtyPerItem,
      quantity,
      unitsByMaterialId.get(component.materialId),
    )
    if (need <= 0) continue
    needs.set(component.materialId, (needs.get(component.materialId) || 0) + need)
  }
  return needs
}

/**
 * After website/miniapp auto-deduction already wrote stock off, CRM replaceParams must
 * adjust via spend/return — not create holds that accept-to-work would spend again.
 */
export async function applyComponentNeedsDeltaInTransaction(
  db: Db,
  input: {
    orderId: number
    userId?: number
    oldNeeds: Map<number, number>
    newNeeds: Map<number, number>
  },
): Promise<void> {
  const materialIds = new Set<number>([...input.oldNeeds.keys(), ...input.newNeeds.keys()])
  for (const materialId of materialIds) {
    const oldQty = Number(input.oldNeeds.get(materialId) || 0)
    const newQty = Number(input.newNeeds.get(materialId) || 0)
    const delta = newQty - oldQty
    if (delta > 0) {
      await MaterialTransactionService.spendInTransaction(db, {
        materialId,
        quantity: delta,
        reason: 'order replaceParams after auto-deduction',
        orderId: input.orderId,
        userId: input.userId,
      })
    } else if (delta < 0) {
      await MaterialTransactionService.addInTransaction(db, {
        materialId,
        quantity: Math.abs(delta),
        reason: 'order replaceParams after auto-deduction',
        orderId: input.orderId,
        userId: input.userId,
      })
    }
  }
}
