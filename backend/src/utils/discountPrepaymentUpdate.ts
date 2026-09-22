/**
 * Смена скидки заказа не должна переписывать предоплату / день кассы.
 *
 * Раньше при offline + prepaymentAmount ≈ oldTotal код ставил
 * prepaymentAmount = newTotal и prepaymentUpdatedAt = now.
 * Сценарий: заказ оплачен 80 BYN со скидкой 20%, оператор снимает скидку →
 * total 100, prepaid раздувается до 100 без доплаты, долг пропадает;
 * плюс сумма «переезжает» на сегодняшний день кассы.
 */
export type DiscountPrepaymentPlan = { action: 'leave' }

export function planPrepaymentAfterDiscountChange(_input: {
  paymentMethod?: string | null
  prepaymentAmount: number
  oldTotal: number
  newTotal: number
}): DiscountPrepaymentPlan {
  return { action: 'leave' }
}
