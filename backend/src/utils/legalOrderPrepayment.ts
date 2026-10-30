/**
 * Заказ юрлица и заказ «по счёту» не получают автоматическую предоплату.
 * Итог сразу остаётся долгом и попадает в дебет акта сверки.
 * Частичную предоплату, которую оператор ввёл сам, не трогаем.
 */

export const PREPAYMENT_SYNC_EPS = 0.005

function money(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function isLegalCashlessOrder(input: {
  customerType?: string | null
  paymentChannel?: string | null
}): boolean {
  return normalized(input.customerType) === 'legal' || normalized(input.paymentChannel) === 'invoice'
}

/** Полная предоплата, которую CRM сам проставляет в сумму заказа. */
export function isFullSyncedPrepayment(prepaymentAmount: unknown, orderTotal: number): boolean {
  const prepayment = money(prepaymentAmount)
  return prepayment > 0 && Math.abs(prepayment - orderTotal) < PREPAYMENT_SYNC_EPS
}

/**
 * Прежняя кассовая автоподстановка: первая позиция или офлайн-предоплата,
 * уже равная старому итогу. Для юрлица и канала «счёт» всегда false.
 */
export function shouldAutoFillCashPrepayment(input: {
  customerType?: string | null
  paymentChannel?: string | null
  paymentMethod?: string | null
  prepaymentAmount?: unknown
  prepaymentStatus?: string | null
  oldTotal: number
  newTotal: number
}): boolean {
  if (isLegalCashlessOrder(input)) return false
  const paymentMethod = input.paymentMethod
  const allowAutoPay = paymentMethod !== null && paymentMethod !== undefined
  const prepaymentAmount = money(input.prepaymentAmount)
  const prepaymentStatus = String(input.prepaymentStatus ?? '')
  const hasPrepayment = prepaymentAmount > 0 || prepaymentStatus.length > 0
  const inSync = Math.abs(prepaymentAmount - input.oldTotal) < PREPAYMENT_SYNC_EPS
  return (
    allowAutoPay &&
    input.newTotal > 0 &&
    (!hasPrepayment || (paymentMethod === 'offline' && inSync))
  )
}

/**
 * Сбрасывать только автоматическую полную предоплату при переводе кассового заказа на юрлицо.
 * Заказ, который уже идёт по счёту, хранит внесённую менеджером оплату — её не обнуляем.
 */
export function shouldClearDefaultPrepaymentForLegal(input: {
  customerType?: string | null
  paymentChannel?: string | null
  prepaymentAmount?: unknown
  orderTotal: number
}): boolean {
  if (normalized(input.customerType) !== 'legal') return false
  if (normalized(input.paymentChannel) === 'invoice') return false
  return isFullSyncedPrepayment(input.prepaymentAmount, input.orderTotal)
}
