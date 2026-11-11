import { db } from '../../../config/database'
import { hasColumn } from '../../../utils/tableSchemaCache'
import {
  rankRecentPostprintServiceIds,
  type RecentPostprintRow,
} from './postprintPickerModel'

function asRows(value: unknown): RecentPostprintRow[] {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => {
      const record = row as Record<string, unknown>
      return {
        itemId: Number(record.itemId ?? record.itemid ?? record.id),
        orderId: Number(record.orderId ?? record.orderid),
        params: record.params,
      }
    })
    .filter((row) => Number.isFinite(row.itemId))
}

/**
 * До 40 id послепечати: сначала позиции открытого заказа (новые сверху),
 * затем заказы этого менеджера (владелец или контактёр).
 */
export async function listRecentPostprintServiceIds(input: {
  userId: number
  orderId?: number | null
}): Promise<number[]> {
  const userId = Number(input.userId)
  if (!Number.isInteger(userId) || userId <= 0) return []

  const orderIdRaw = input.orderId == null ? null : Number(input.orderId)
  const currentOrderId = orderIdRaw != null && Number.isInteger(orderIdRaw) && orderIdRaw > 0 ? orderIdRaw : null

  const hasContact = await hasColumn('orders', 'contact_user_id').catch(() => false)
  const hasCancelled = await hasColumn('orders', 'is_cancelled').catch(() => false)

  const currentValue = currentOrderId
    ? await db.all(
        `SELECT id AS itemId, orderId AS orderId, params AS params
         FROM items
         WHERE orderId = ?
         ORDER BY id DESC`,
        currentOrderId,
      )
    : []

  const managerMatch = hasContact ? '(o.userId = ? OR o.contact_user_id = ?)' : 'o.userId = ?'
  const params: number[] = hasContact ? [userId, userId] : [userId]
  let sql = `SELECT i.id AS itemId, i.orderId AS orderId, i.params AS params
    FROM items i
    INNER JOIN orders o ON o.id = i.orderId
    WHERE ${managerMatch}`
  if (hasCancelled) sql += ' AND COALESCE(o.is_cancelled, 0) = 0'
  if (currentOrderId) {
    sql += ' AND i.orderId != ?'
    params.push(currentOrderId)
  }
  sql += ' ORDER BY i.id DESC LIMIT 400'
  const managerValue = await db.all(sql, ...params)

  return rankRecentPostprintServiceIds(asRows(currentValue), asRows(managerValue))
}
