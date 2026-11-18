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
 * BePaid уже зачислил деньги: paid или successful и метод online.
 * Сумму такого платежа при смене состава не уменьшаем и возврат не создаём.
 */
export function isBepaidSettledPayment(order: MoneyOrder): boolean {
  const prepay = money(order.prepaymentAmount)
  if (prepay <= 0) return false
  const status = String(order.prepaymentStatus ?? '').trim().toLowerCase()
  const method = String(order.paymentMethod ?? '').trim().toLowerCase()
  return method === 'online' && (status === 'paid' || status === 'successful')
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
 * Заказ с сайта. BePaid paid/successful не мешает сменить состав на любом статусе.
 * Касса (офлайн) и платёжка bank по-прежнему закрывают удаление в «Ожидает».
 * Выдача и проведённый документ закрывают удаление на любом статусе.
 * Последнюю строку здесь не запрещаем.
 */
export function websiteWaitingDeleteReason(input: {
  source?: string | null
  waiting: boolean
  prepaymentAmount?: unknown
  prepaymentStatus?: string | null
  paymentMethod?: string | null
  issued: boolean
}): string | null {
  if (input.source !== 'website') return null
  if (input.issued) return WEBSITE_WAITING_ISSUE_BLOCK
  if (!input.waiting || isBepaidSettledPayment(input)) return null
  if (hasCollectedPayment(input)) return WEBSITE_WAITING_PAYMENT_BLOCK
  return null
}

/** Офлайн-предоплату, которая больше нового итога, подрезаем. Платёж BePaid не трогаем. */
export function shouldShrinkPrepaymentOnItemDelete(input: {
  paymentMethod?: string | null
  prepaymentStatus?: string | null
  prepaymentAmount?: unknown
  newTotal: number
}): boolean {
  if (isBepaidSettledPayment(input)) return false
  const method = String(input.paymentMethod ?? '').trim().toLowerCase()
  if (method !== 'offline') return false
  return money(input.prepaymentAmount) > input.newTotal
}
