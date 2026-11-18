export const WEBSITE_WAITING_PAYMENT_BLOCK =
  'Нельзя удалить позицию: по заказу уже проведена оплата. Касса и платёж останутся на старый состав.'

export const WEBSITE_WAITING_ISSUE_BLOCK =
  'Нельзя удалить позицию: по заказу уже есть выдача или проведённый документ.'

type MoneyOrder = {
  prepaymentAmount?: unknown
  prepaymentStatus?: string | null
  paymentMethod?: string | null
}

function money(value: unknown): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

/**
 * Уже полученные деньги. Ожидающая ссылка BePaid и ошибка оплаты не считаются.
 * Совпадает с collectedPrepaymentAmount на фронте.
 */
export function hasCollectedPayment(order: MoneyOrder): boolean {
  const prepay = money(order.prepaymentAmount)
  if (prepay <= 0) return false
  const status = String(order.prepaymentStatus ?? '').trim().toLowerCase()
  if (status === 'paid' || status === 'successful' || status === 'bank') return true
  const method = String(order.paymentMethod ?? '').trim().toLowerCase()
  if (method === 'online' || method === 'telegram') return false
  if (status === 'pending' || status === 'failed' || status === 'cancelled' || status === 'canceled') {
    return false
  }
  return true
}

/**
 * Дополнительный запрет только для source=website в статусе «Ожидает».
 * Остальные заказы этот фильтр не трогает.
 * Последнюю строку здесь не запрещаем: отдельного запрета пустого состава нет.
 */
export function websiteWaitingDeleteReason(input: {
  source?: string | null
  waiting: boolean
  prepaymentAmount?: unknown
  prepaymentStatus?: string | null
  paymentMethod?: string | null
  issued: boolean
}): string | null {
  if (input.source !== 'website' || !input.waiting) return null
  if (hasCollectedPayment(input)) return WEBSITE_WAITING_PAYMENT_BLOCK
  if (input.issued) return WEBSITE_WAITING_ISSUE_BLOCK
  return null
}
