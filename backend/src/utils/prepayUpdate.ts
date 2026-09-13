/**
 * How POST /orders/:id/prepay should update payment fields when creating a BePaid checkout.
 * Must never downgrade a confirmed payment (paid/successful) to pending or wipe prepaid amount
 * (same class of bug as send-payment-link remainder wipe).
 */

export type PrepayOrderSnapshot = {
  prepaymentStatus?: string | null
  prepaymentAmount?: number | string | null
  paymentMethod?: string | null
}

export type PrepayDbUpdate =
  | {
      mode: 'replace'
      prepaymentAmount: number
      prepaymentStatus: 'paid' | 'pending'
      paymentMethod: string
      paymentUrl: string | null
      paymentId: string | null
      stampPrepaymentUpdatedAt: boolean
    }
  | {
      mode: 'keep_paid_refresh_checkout'
      paymentUrl: string | null
      paymentId: string | null
    }

export function isPaidPrepaymentStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').toLowerCase()
  return s === 'paid' || s === 'successful'
}

/**
 * Plan DB update after /prepay with a non-zero amount.
 * Online checkout on an already-paid order only refreshes BePaid URL/token.
 */
export function planPrepayUpdate(
  order: PrepayOrderSnapshot,
  input: {
    amount: number
    paymentMethod: string
    paymentUrl: string | null
    paymentId: string | null
  },
): PrepayDbUpdate {
  const method = String(input.paymentMethod || 'offline').toLowerCase()
  const wantsOnlineCheckout = method === 'online'

  if (wantsOnlineCheckout && isPaidPrepaymentStatus(order.prepaymentStatus)) {
    return {
      mode: 'keep_paid_refresh_checkout',
      paymentUrl: input.paymentUrl,
      paymentId: input.paymentId,
    }
  }

  const prepaymentStatus = wantsOnlineCheckout ? 'pending' : 'paid'
  return {
    mode: 'replace',
    prepaymentAmount: input.amount,
    prepaymentStatus,
    paymentMethod: method === 'online' ? 'online' : method === 'telegram' ? 'telegram' : 'offline',
    paymentUrl: input.paymentUrl,
    paymentId: input.paymentId,
    stampPrepaymentUpdatedAt: true,
  }
}
