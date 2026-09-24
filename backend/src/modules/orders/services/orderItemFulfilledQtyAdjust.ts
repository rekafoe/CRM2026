import type { Database } from 'sqlite'
import { MaterialTransactionService } from '../../warehouse/services/materialTransactionService'

export type ItemComponentReservation = {
  materialId: number
  qtyPerItem: number
  reservationId?: number
}

function isMeterUnit(unitRaw: unknown): boolean {
  const unit = String(unitRaw || '').trim().toLowerCase()
  return unit === 'м' || unit === 'пог.м' || unit === 'пог. м' || unit.includes('метр')
}

/** Объём холда/списания для qty_per_item × тираж (метры — 2 знака, иначе ceil). */
export function computeRequiredQuantityForReservation(
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

function isFulfilledStatus(status: unknown): boolean {
  const s = String(status || '').trim().toLowerCase()
  return s === 'fulfilled' || s === 'confirmed'
}

/**
 * После «Принят в работу» резервы `fulfilled` и материалы уже списаны.
 * Смена тиража в updateItem раньше только cancel'ила reservationId (без restore/spend) —
 * склад оставался на старом объёме.
 *
 * Вызывать внутри уже открытой транзакции (без вложенного BEGIN).
 * @returns true если хотя бы один компонент был fulfilled и склад скорректирован
 */
export async function adjustFulfilledReservationsForQuantityChange(
  db: Database,
  args: {
    orderId: number
    components: ItemComponentReservation[]
    /** Старый тираж позиции (до UPDATE). */
    oldQuantity: number
    /** Новый тираж позиции. */
    newQuantity: number
    userId?: number
  },
): Promise<boolean> {
  const oldQty = Math.max(1, Number(args.oldQuantity) || 1)
  const newQty = Math.max(1, Number(args.newQuantity) || 1)
  if (oldQty === newQty) return false

  const reservationIds = [
    ...new Set(
      args.components
        .map((c) => Number(c.reservationId))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ]
  if (reservationIds.length === 0) return false

  const placeholders = reservationIds.map(() => '?').join(',')
  const rows = (await db.all(
    `SELECT id, material_id, quantity_reserved, status
     FROM material_reservations
     WHERE id IN (${placeholders})`,
    reservationIds,
  )) as Array<{
    id: number
    material_id: number
    quantity_reserved: number
    status: string
  }>

  const byId = new Map((Array.isArray(rows) ? rows : []).map((r) => [Number(r.id), r]))
  const fulfilledComponents = args.components.filter((c) => {
    const id = Number(c.reservationId)
    const row = byId.get(id)
    return row != null && isFulfilledStatus(row.status)
  })
  if (fulfilledComponents.length === 0) return false

  const materialIds = [
    ...new Set(
      fulfilledComponents
        .map((c) => Number(c.materialId))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ]
  const unitByMaterial = new Map<number, string | null>()
  if (materialIds.length > 0) {
    const unitRows = (await db.all(
      `SELECT id, unit FROM materials WHERE id IN (${materialIds.map(() => '?').join(',')})`,
      materialIds,
    )) as Array<{ id: number; unit?: string | null }>
    for (const row of Array.isArray(unitRows) ? unitRows : []) {
      unitByMaterial.set(Number(row.id), row.unit ?? null)
    }
  }

  const deltaQty = newQty - oldQty
  const absDelta = Math.abs(deltaQty)

  for (const c of fulfilledComponents) {
    const reservationId = Number(c.reservationId)
    const row = byId.get(reservationId)
    if (!row) continue
    const materialId = Number(c.materialId) || Number(row.material_id)
    const unit = unitByMaterial.get(materialId)
    const deltaNeed = computeRequiredQuantityForReservation(c.qtyPerItem, absDelta, unit)
    if (!(deltaNeed > 0)) continue

    if (deltaQty < 0) {
      await MaterialTransactionService.addInTransaction(db, {
        materialId,
        quantity: deltaNeed,
        reason: 'order update qty - (fulfilled)',
        orderId: args.orderId,
        userId: args.userId,
      })
    } else {
      await MaterialTransactionService.spendInTransaction(db, {
        materialId,
        quantity: deltaNeed,
        reason: 'order update qty + (fulfilled)',
        orderId: args.orderId,
        userId: args.userId,
      })
    }

    const nextReserved = computeRequiredQuantityForReservation(c.qtyPerItem, newQty, unit)
    await db.run(
      `UPDATE material_reservations SET quantity_reserved = ? WHERE id = ?`,
      [nextReserved, reservationId],
    )
  }

  return true
}
