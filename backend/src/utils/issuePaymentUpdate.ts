/**
 * Поля оплаты при выдаче заказа (status → 7).
 * Остаток в кассу идёт через debt_closed_events.
 *
 * Нельзя:
 * - переписывать online/telegram в offline и сдвигать prepaymentUpdatedAt
 *   (безнал попадает в кассу как наличные);
 * - сдвигать уже проставленный offline prepaymentUpdatedAt на день выдачи
 *   (предоплата пропадает из дня приёмки / разъезжается с ящиком).
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

function existingPrepaymentStamp(order: IssuePaymentSource): string | null {
  if (typeof order.prepaymentUpdatedAt !== 'string') return null
  const s = order.prepaymentUpdatedAt.trim()
  return s ? s : null
}

export function planIssuePaymentUpdate(
  order: IssuePaymentSource,
  opts: { issueDateTime: string },
): IssuePaymentUpdatePlan {
  const existingStamp = existingPrepaymentStamp(order)

  if (isRemotePaymentMethod(order.paymentMethod)) {
    return {
      paymentMethod: String(order.paymentMethod).toLowerCase() as 'online' | 'telegram',
      prepaymentUpdatedAt: existingStamp ?? opts.issueDateTime,
    }
  }

  return {
    paymentMethod: 'offline',
    // Уже принятая офлайн-предоплата должна остаться в своём дне кассы.
    prepaymentUpdatedAt: existingStamp ?? opts.issueDateTime,
  }
}
