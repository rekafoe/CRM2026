import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'
import { OrderRepository } from '../repositories/orderRepository'
import { computeOrderAmounts } from '../utils/orderAmounts'
import {
  createBePaidCheckout,
  resolveBePaidReturnUrls,
  splitCustomerName,
} from './bepaidCheckoutService'
import { SITE_PICKUP_POINTS } from '../config/sitePickupPoints'

export type OwnedMiniappOrder = {
  id: number
  number: string | null
  status: number
  status_name: string | null
  source: string | null
  created_at: string | null
  prepaymentAmount: number | null
  prepaymentStatus: string | null
  paymentMethod: string | null
  paymentUrl: string | null
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  discount_percent: number | null
}

export async function findOwnedMiniappOrder(chatId: string, reference: unknown): Promise<OwnedMiniappOrder | null> {
  const value = String(reference ?? '').trim().replace(/^#/, '')
  if (!value) return null
  const numericId = /^\d+$/.test(value) ? Number(value) : null
  const db = await getDb()
  const row = await db.get<OwnedMiniappOrder>(
    `SELECT
       o.id, o.number, o.status, st.name AS status_name, o.source,
       COALESCE(o.createdAt, o.created_at) AS created_at,
       o.prepaymentAmount, o.prepaymentStatus, o.paymentMethod, o.paymentUrl,
       o.customerName, o.customerEmail, o.customerPhone,
       COALESCE(o.discount_percent, 0) AS discount_percent
     FROM orders o
     LEFT JOIN order_statuses st ON st.id = o.status
     WHERE o.telegram_chat_id = ?
       AND COALESCE(o.miniapp_checkout_state, '') != 'draft'
       AND ${numericId != null ? 'o.id = ?' : 'o.number = ? COLLATE NOCASE'}
     LIMIT 1`,
    [chatId, numericId ?? value],
  )
  return row ?? null
}

export function formatOwnedOrderStatus(order: OwnedMiniappOrder): string {
  return `${order.number || `Заказ #${order.id}`}: ${order.status_name || `статус ${order.status}`}`
}

export async function buildPickupBranchesText(): Promise<string> {
  const db = await getDb()
  let branches: Array<{ name: string; address?: string | null; description?: string | null }> = []
  try {
    branches = await db.all(
      `SELECT name, address, description FROM departments
       WHERE is_pickup_point = 1 AND COALESCE(is_active, 1) = 1
       ORDER BY sort_order, name`,
    )
  } catch {}
  const rows = branches.length > 0 ? branches : SITE_PICKUP_POINTS
  const lines = rows.map((branch) => {
    const description = 'description' in branch ? branch.description : null
    const address = branch.address || description
    return `• ${branch.name}${address ? ` — ${address}` : ''}`
  })
  return `Точки самовывоза:\n${lines.join('\n')}\n\nТочку можно выбрать при оформлении заказа в PrintCore App.`
}

export async function createMiniappPaymentLink(chatId: string, orderId: number): Promise<string> {
  const order = await findOwnedMiniappOrder(chatId, orderId)
  if (!order) throw Object.assign(new Error('Заказ не найден'), { code: 'MINIAPP_ORDER_NOT_FOUND' })
  const settled = ['paid', 'successful', 'bank'].includes(String(order.prepaymentStatus || '').toLowerCase())
  if (settled) throw Object.assign(new Error('Заказ уже оплачен'), { code: 'MINIAPP_ORDER_PAID' })
  const existingUrl = String(order.paymentUrl || '').trim()
  if (existingUrl && String(order.paymentMethod || '').toLowerCase() === 'online') {
    try {
      const parsed = new URL(existingUrl)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return existingUrl
    } catch {}
  }

  const items = await OrderRepository.getItemsByOrderId(orderId)
  const amounts = computeOrderAmounts({ items, discount_percent: order.discount_percent ?? 0 })
  const amount = Math.round(amounts.totalAmount * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error('Сумма к оплате должна быть больше нуля'), { code: 'MINIAPP_PAYMENT_AMOUNT_INVALID' })
  }
  const email = String(order.customerEmail || '').trim()
  const { firstName, lastName } = splitCustomerName(order.customerName)
  const urls = resolveBePaidReturnUrls(orderId)
  const checkout = await createBePaidCheckout({
    amountByn: amount,
    orderTrackingId: String(order.number || `ord-${orderId}`),
    description: `Оплата заказа ${order.number || `#${orderId}`}`,
    customer: {
      email,
      firstName,
      lastName,
      phone: order.customerPhone || undefined,
    },
    successUrl: urls.successUrl,
    failUrl: urls.failUrl,
    notificationUrl: urls.notificationUrl,
  })

  const db = await getDb()
  const hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt')
  await db.run(
    `UPDATE orders
     SET prepaymentAmount = ?, prepaymentStatus = 'pending', paymentUrl = ?, paymentId = ?, paymentMethod = 'online',
         ${hasPrepaymentUpdatedAt ? "prepaymentUpdatedAt = datetime('now', 'localtime')," : ''}
         updated_at = datetime('now', 'localtime')
     WHERE id = ? AND telegram_chat_id = ?`,
    [amount, checkout.redirectUrl, checkout.token, orderId, chatId],
  )
  return checkout.redirectUrl
}
