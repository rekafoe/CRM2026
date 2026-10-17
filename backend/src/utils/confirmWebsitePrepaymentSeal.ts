/**
 * Website `confirm-prepayment` is a parallel paid-writer to BePaid webhook.
 * After Issue (paymentId ISSUE-… / debt_closed) or any already-paid seal
 * (offline /prepay clears paymentId), a late successful confirm must not
 * SET prepaymentAmount / paymentMethod / day.
 */

export type ConfirmPrepaymentSealReason = 'issued' | 'already_paid'

export function planConfirmWebsitePrepaymentSeal(input: {
  prepaymentStatus?: string | null
  storedPaymentId?: string | null
  incomingPaymentId?: string | null
  hasDebtClosedEvent?: boolean
}): { sealed: false } | { sealed: true; reason: ConfirmPrepaymentSealReason } {
  const storedPaymentId = String(input.storedPaymentId ?? '').trim()
  const incomingPaymentId = String(input.incomingPaymentId ?? '').trim()
  if (input.hasDebtClosedEvent === true || storedPaymentId.startsWith('ISSUE-')) {
    return { sealed: true, reason: 'issued' }
  }
  const status = String(input.prepaymentStatus ?? '').trim().toLowerCase()
  const alreadyPaid = status === 'paid' || status === 'successful'
  if (!alreadyPaid) return { sealed: false }
  const samePayment =
    Boolean(incomingPaymentId) && Boolean(storedPaymentId) && incomingPaymentId === storedPaymentId
  if (samePayment) return { sealed: false }
  return { sealed: true, reason: 'already_paid' }
}
