import type { Database } from 'sqlite'
import { MaterialTransactionService } from '../../warehouse/services/materialTransactionService'

export type ItemComponentReservation = {
  materialId: number
  qtyPerItem: number
  reservationId?: number
}

/**
 * При удалении позиции: снять активные холды или вернуть склад по fulfilled,
 * без вложенного BEGIN (вызывать внутри уже открытой транзакции).
 *
 * Раньше deleteItem вызывал UnifiedWarehouseService.cancelReservations /
 * MaterialTransactionService.return внутри BEGIN → SQLITE «cannot start a
 * transaction within a transaction» → позиция с резервами не удалялась.
 * После «Принят в работу» (fulfilled) cancel без restore оставлял списание.
 */
export async function releaseItemReservationsOnDelete(
  db: Database,
  args: {
    orderId: number
    reservationIds: number[]
    userId?: number
    reason?: string
  },
): Promise<{ cancelled: number; restored: number }> {
  const { orderId, reservationIds, userId } = args
  const reason = args.reason || 'order delete item'
  const uniqueIds = [
    ...new Set(
      reservationIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ]

  let cancelled = 0
  let restored = 0

  for (const reservationId of uniqueIds) {
    const reservation = await db.get<{
      id: number
      material_id: number
      order_id: number | null
      quantity_reserved: number
      status: string
    }>(
      `SELECT id, material_id, order_id, quantity_reserved, status
       FROM material_reservations WHERE id = ?`,
      [reservationId],
    )
    if (!reservation) continue

    const status = String(reservation.status || '').toLowerCase()
    if (status === 'cancelled' || status === 'expired') continue

    const qty = Math.max(0, Number(reservation.quantity_reserved) || 0)

    if (status === 'fulfilled' || status === 'confirmed') {
      if (qty > 0) {
        await MaterialTransactionService.addInTransaction(db, {
          materialId: Number(reservation.material_id),
          quantity: qty,
          reason,
          orderId: reservation.order_id != null ? Number(reservation.order_id) : orderId,
          userId,
        })
        restored += 1
      }
    }

    await db.run(
      `UPDATE material_reservations SET status = 'cancelled' WHERE id = ?`,
      [reservationId],
    )
    cancelled += 1
  }

  return { cancelled, restored }
}
