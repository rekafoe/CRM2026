/**
 * How to apply a successful BePaid / website confirm amount onto an order.
 *
 * - First paid notification: use the gateway amount.
 * - Already paid + same paymentId: idempotent replay (keep existing).
 * - Already paid + different/new payment: add (remainder link after offline/online prepay).
 * - Never replace a larger prepaid amount with a smaller gateway amount.
 */

export type BePaidPaidAmountInput = {
  existingPrepay: number
  amountByn: number
  alreadyPaid: boolean
  existingPaymentId?: string | null
  incomingPaymentId?: string | null
}

export function resolveBePaidPaidAmount(input: BePaidPaidAmountInput): number {
  const existing = Number.isFinite(input.existingPrepay) ? Math.max(0, input.existingPrepay) : 0
  const incoming =
    Number.isFinite(input.amountByn) && input.amountByn > 0
      ? Math.round(input.amountByn * 100) / 100
      : 0

  if (incoming <= 0) return existing

  if (!input.alreadyPaid) return incoming

  const existingId = String(input.existingPaymentId ?? '').trim()
  const incomingId = String(input.incomingPaymentId ?? '').trim()
  if (existingId && incomingId && existingId === incomingId) {
    return existing
  }

  return Math.round((existing + incoming) * 100) / 100
}
