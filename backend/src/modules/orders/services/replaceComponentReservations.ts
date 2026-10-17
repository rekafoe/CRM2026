/**
 * Cancel holds listed on item params, then reserve the incoming calculator components.
 * Caller must already be inside a write transaction that re-read the item row
 * (BEGIN IMMEDIATE), otherwise concurrent replaceParams can cancel the same stale
 * reservationIds and leave orphan active holds → double warehouse write-off on accept.
 */

export type ReplaceComponentInput = {
  materialId: number
  qtyPerItem: number
}

export type ReplaceComponentResult = {
  materialId: number
  qtyPerItem: number
  reservationId?: number
}

export type MaterialShortageItem = {
  materialId: number
  name: string
  available: number
  required: number
}

type DbLike = {
  get: <T = unknown>(sql: string, ...params: unknown[]) => Promise<T | undefined>
  all: <T = unknown>(sql: string, ...params: unknown[]) => Promise<T>
  run: (sql: string, ...params: unknown[]) => Promise<{ lastID?: number; changes?: number }>
}

function isMeterUnit(unitRaw: unknown): boolean {
  const unit = String(unitRaw || '').trim().toLowerCase()
  return unit === 'м' || unit === 'пог.м' || unit === 'пог. м' || unit.includes('метр')
}

function computeRequiredQuantity(
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

/** Collect reservationIds from params.components for cancel. */
export function reservationIdsFromComponents(components: unknown): number[] {
  if (!Array.isArray(components)) return []
  return components
    .map((component) => Number((component as { reservationId?: number }).reservationId))
    .filter((id) => Number.isFinite(id) && id > 0)
}

/**
 * Cancel old component holds (by id), then insert new active holds for the full quantity.
 * Soft-shortage: records shortage and continues without a reservationId (same as addItem).
 */
export async function replaceComponentReservationsInTx(
  db: DbLike,
  orderId: number,
  oldComponents: unknown,
  incoming: ReplaceComponentInput[],
  quantity: number,
): Promise<{
  components: ReplaceComponentResult[]
  shortages: MaterialShortageItem[]
}> {
  const reservationIds = reservationIdsFromComponents(oldComponents)
  if (reservationIds.length > 0) {
    await db.run(
      `UPDATE material_reservations SET status = 'cancelled' WHERE id IN (${reservationIds.map(() => '?').join(',')})`,
      ...reservationIds,
    )
  }

  if (incoming.length === 0) {
    return { components: [], shortages: [] }
  }

  const ids = incoming
    .map((component) => Number(component.materialId))
    .filter((id) => Number.isFinite(id) && id > 0)
  const rows = ids.length
    ? await db.all<Array<{ id: number; quantity: number; name: string; unit?: string | null }>>(
        `SELECT id, quantity, name, unit FROM materials WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids,
      )
    : []
  const byId = new Map((Array.isArray(rows) ? rows : []).map((row) => [Number(row.id), row]))
  const now = new Date().toISOString()
  const reserved: ReplaceComponentResult[] = []
  const shortages: MaterialShortageItem[] = []

  for (const component of incoming) {
    const materialId = Number(component.materialId)
    const qtyPerItem = Number(component.qtyPerItem) || 0
    const material = byId.get(materialId)
    if (!material) {
      const error = new Error(`Материал с ID ${materialId} не найден`)
      ;(error as { status?: number }).status = 400
      throw error
    }
    const neededQty = computeRequiredQuantity(qtyPerItem, quantity, material.unit)
    if (neededQty <= 0) {
      reserved.push({ materialId, qtyPerItem })
      continue
    }
    const existing = await db.get<{ reserved: number }>(
      `SELECT COALESCE(SUM(quantity_reserved), 0) as reserved
         FROM material_reservations
        WHERE material_id = ? AND status = 'active'
          AND (expires_at IS NULL OR expires_at > ?)`,
      [materialId, now],
    )
    const available = Number(material.quantity) - Number(existing?.reserved || 0)
    if (available < neededQty) {
      shortages.push({
        materialId,
        name: material.name,
        available: Math.round(available * 100) / 100,
        required: neededQty,
      })
      reserved.push({ materialId, qtyPerItem })
      continue
    }
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)
    const inserted = await db.run(
      `INSERT INTO material_reservations
        (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderId,
      neededQty,
      'reserve for order item replace',
      expiresAt.toISOString(),
    )
    reserved.push({ materialId, qtyPerItem, reservationId: inserted.lastID || undefined })
  }

  return { components: reserved, shortages }
}
