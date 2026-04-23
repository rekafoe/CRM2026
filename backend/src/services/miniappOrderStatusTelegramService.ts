import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'
import { TelegramService } from './telegramService'
import { escapeHtml } from '../utils/telegramText'
import { logger } from '../utils/logger'

/**
 * Сообщение в личку Telegram клиенту при смене статуса (заказы Mini App, source=mini_app, есть telegram_chat_id).
 * Тот же бот, что и для webhook (TELEGRAM_BOT_TOKEN).
 */
export async function tryNotifyTelegramOrderStatusForMiniappOrder(params: {
  orderId: number
  oldStatusId: number
  newStatusId: number
}): Promise<void> {
  if (params.oldStatusId === params.newStatusId) {
    return
  }
  if (!TelegramService.isEnabled()) {
    return
  }
  try {
    if (!(await hasColumn('orders', 'telegram_chat_id'))) {
      return
    }
    const db = await getDb()
    const order = (await db.get(
      'SELECT id, number, source, telegram_chat_id FROM orders WHERE id = ?',
      [params.orderId]
    )) as
      | { id: number; number: string | null; source: string | null; telegram_chat_id: string | null }
      | undefined
    if (!order) {
      return
    }
    if ((order.source || '') !== 'mini_app') {
      return
    }
    const chatId = order.telegram_chat_id != null ? String(order.telegram_chat_id).trim() : ''
    if (!chatId) {
      return
    }
    const st = (await db.get<{ name: string }>(
      'SELECT name FROM order_statuses WHERE id = ?',
      [params.newStatusId]
    )) as { name?: string } | undefined
    const statusName = st?.name != null ? String(st.name) : `№${params.newStatusId}`
    const num = (order.number && String(order.number).trim()) || `заказ #${order.id}`
    const text = `*Статус заказа обновлён*

${escapeHtml(num)}

Новый статус: ${escapeHtml(statusName)}`
    const ok = await TelegramService.sendMessageToUser(chatId, text)
    if (!ok) {
      logger.warn('miniapp order status: Telegram message not sent', { orderId: params.orderId, chatId: chatId.slice(0, 6) + '…' })
    }
  } catch (e) {
    logger.error('tryNotifyTelegramOrderStatusForMiniappOrder', { error: (e as Error)?.message, orderId: params.orderId })
  }
}
