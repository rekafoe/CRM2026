import type { Database } from 'sqlite'

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

/**
 * При смене тиража позиции: снять старые холды и создать новые на полный newQuantity.
 * Вызывать внутри уже открытой транзакции (без вложенного BEGIN).
 */
export async function syncItemReservationsForQuantity(
  db: Database,
  args: {
    orderId: number
    components: ItemComponentReservation[]
    newQuantity: number
    reason: string
  },
): Promise<ItemComponentReservation[]> {
  const { orderId, components, newQuantity, reason } = args
  if (!Array.isArray(components) || components.length === 0) return []

  const toCancel = components
    .map((c) => Number(c.reservationId))
    .filter((id) => Number.isFinite(id) && id > 0)

  if (toCancel.length > 0) {
    await db.run(
      `UPDATE material_reservations
       SET status = 'cancelled'
       WHERE id IN (${toCancel.map(() => '?').join(',')})`,
      ...toCancel,
    )
  }

  const materialIds = [
    ...new Set(
      components
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
    for (const row of unitRows ?? []) {
      unitByMaterial.set(Number(row.id), row.unit ?? null)
    }
  }

  const next: ItemComponentReservation[] = []
  const nowIso = new Date().toISOString()

  for (const component of components) {
    const materialId = Number(component.materialId)
    const qtyPerItem = Number(component.qtyPerItem)
    if (!Number.isFinite(materialId) || materialId <= 0 || !Number.isFinite(qtyPerItem)) {
      continue
    }

    const quantity = computeRequiredQuantityForReservation(
      qtyPerItem,
      newQuantity,
      unitByMaterial.get(materialId),
    )
    if (!(quantity > 0)) {
      next.push({ materialId, qtyPerItem })
      continue
    }

    const material = await db.get<{ quantity: number; name: string }>(
      'SELECT quantity, name FROM materials WHERE id = ?',
      [materialId],
    )
    if (!material) {
      throw Object.assign(new Error(`Материал с ID ${materialId} не найден`), {
        status: 400,
        code: 'MATERIAL_NOT_FOUND',
      })
    }

    const existing = await db.get<{ reserved: number }>(
      `SELECT COALESCE(SUM(quantity_reserved), 0) as reserved
       FROM material_reservations
       WHERE material_id = ? AND status = 'active'
         AND (expires_at IS NULL OR expires_at > ?)`,
      [materialId, nowIso],
    )
    const reserved = Number(existing?.reserved || 0)
    const available = Number(material.quantity) - reserved
    if (available < quantity) {
      throw Object.assign(
        new Error(
          `Недостаточно материала "${material.name}". Доступно: ${available}, требуется: ${quantity}`,
        ),
        { status: 400, code: 'INSUFFICIENT_MATERIAL' },
      )
    }

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)
    const result = await db.run(
      `INSERT INTO material_reservations
         (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderId,
      quantity,
      reason,
      expiresAt.toISOString(),
    )

    next.push({
      materialId,
      qtyPerItem,
      reservationId: Number(result.lastID) || undefined,
    })
  }

  return next
}
