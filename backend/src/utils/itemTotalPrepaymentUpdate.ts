/**
 * Смена цены/тиража позиции или удаление строки не должна трогать prepaid.
 *
 * Раньше offline+inSync переписывал `prepaymentAmount` и `prepaymentUpdatedAt = now`:
 * рост итога «доплачивал» в кассу без денег клиента, а день оплаты уезжал с реального прихода.
 * После `replaceParams` этот путь вызывается при каждом сохранении калькулятора, не только у custom.
 */
export type ItemTotalPrepaymentPlan = { action: 'leave_prepaid_unchanged' }

export function planPrepaymentAfterItemTotalChange(_input?: {
  paymentMethod?: string | null
  prepaymentAmount?: number
  oldTotal?: number
  newTotal?: number
}): ItemTotalPrepaymentPlan {
  return { action: 'leave_prepaid_unchanged' }
}
