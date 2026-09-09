/**
 * How POST /orders/:id/send-payment-link should update payment fields after creating a BePaid checkout.
 * Must never downgrade a confirmed payment (paid/successful) to pending or wipe prepaid amount.
 */

export type SendPaymentLinkOrderSnapshot = {
  prepaymentStatus?: string | null
  prepaymentAmount?: number | string | null
  paymentMethod?: string | null
}

export type SendPaymentLinkDbUpdate =
  | {
      mode: 'new_pending'
      prepaymentAmount: number
      prepaymentStatus: 'pending'
      paymentMethod: 'online'
      paymentUrl: string
      paymentId: string | null
    }
  | {
      mode: 'keep_paid_refresh_checkout'
      paymentUrl: string
      paymentId: string | null
    }

export function isPaidPrepaymentStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').toLowerCase()
  return s === 'paid' || s === 'successful'
}

export function planSendPaymentLinkUpdate(
  order: SendPaymentLinkOrderSnapshot,
  checkout: { amount: number; paymentUrl: string; paymentId: string | null },
): SendPaymentLinkDbUpdate {
  if (isPaidPrepaymentStatus(order.prepaymentStatus)) {
    return {
      mode: 'keep_paid_refresh_checkout',
      paymentUrl: checkout.paymentUrl,
      paymentId: checkout.paymentId,
    }
  }
  return {
    mode: 'new_pending',
    prepaymentAmount: checkout.amount,
    prepaymentStatus: 'pending',
    paymentMethod: 'online',
    paymentUrl: checkout.paymentUrl,
    paymentId: checkout.paymentId,
  }
}
