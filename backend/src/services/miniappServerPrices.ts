import { getDb } from '../config/database'
import { OrderPricingService } from '../modules/orders/services/orderPricingService'
import { logger } from '../utils/logger'

/**
 * Mini App create идёт через createOrderWithItems (без auto-deduction), поэтому
 * в отличие от website createOrderWithAutoDeduction серверный пересчёт цен
 * раньше не вызывался — клиентский price/totalCost оставался в заказе.
 * Снимаем CRM-only lock и пересчитываем simplified-позиции по каталогу.
 */
export async function applyServerPricesToMiniappOrder(orderId: number): Promise<void> {
  const db = await getDb()
  const items = (await db.all(
    'SELECT id, params FROM items WHERE orderId = ? ORDER BY id ASC',
    [orderId],
  )) as Array<{ id: number; params: string | null }>

  for (const item of items ?? []) {
    let paramsObj: Record<string, unknown> = {}
    try {
      paramsObj = item.params ? (JSON.parse(String(item.params)) as Record<string, unknown>) : {}
    } catch {
      paramsObj = {}
    }
    if (paramsObj.priceLockedByCalculator !== true) continue
    delete paramsObj.priceLockedByCalculator
    await db.run('UPDATE items SET params = ? WHERE id = ? AND orderId = ?', [
      JSON.stringify(paramsObj),
      item.id,
      orderId,
    ])
  }

  try {
    await OrderPricingService.recalculateOrderPrices(orderId)
  } catch (recalcErr) {
    logger.warn('[miniappCheckout] пересчёт цен не выполнен', {
      orderId,
      error: (recalcErr as Error).message,
    })
  }
}
