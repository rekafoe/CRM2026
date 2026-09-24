/**
 * Поля оплаты при выдаче заказа (status → 7).
 * Остаток в кассу идёт через debt_closed_events; online/telegram предоплату
 * нельзя переписывать в offline и сдвигать prepaymentUpdatedAt на день выдачи —
 * иначе безнал попадает в кассу как наличные.
 */

export type IssuePaymentSource = {
  paymentMethod?: string | null
  prepaymentUpdatedAt?: string | null
}

export function isRemotePaymentMethod(method: string | null | undefined): boolean {
  const m = String(method ?? '').toLowerCase()
  return m === 'online' || m === 'telegram'
}

export type IssuePaymentUpdatePlan = {
  paymentMethod: 'online' | 'offline' | 'telegram'
  /** Значение для prepaymentUpdatedAt (если колонка есть). */
  prepaymentUpdatedAt: string
}

export function planIssuePaymentUpdate(
  order: IssuePaymentSource,
  opts: { issueDateTime: string },
): IssuePaymentUpdatePlan {
  if (isRemotePaymentMethod(order.paymentMethod)) {
    const existingStamp =
      typeof order.prepaymentUpdatedAt === 'string' && order.prepaymentUpdatedAt.trim()
        ? order.prepaymentUpdatedAt.trim()
        : opts.issueDateTime
    return {
      paymentMethod: String(order.paymentMethod).toLowerCase() as 'online' | 'telegram',
      prepaymentUpdatedAt: existingStamp,
    }
  }

  return {
    paymentMethod: 'offline',
    prepaymentUpdatedAt: opts.issueDateTime,
  }
}
