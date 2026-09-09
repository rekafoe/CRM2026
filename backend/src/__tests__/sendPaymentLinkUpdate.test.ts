import {
  planSendPaymentLinkUpdate,
  isPaidPrepaymentStatus,
} from '../utils/sendPaymentLinkUpdate'

describe('planSendPaymentLinkUpdate', () => {
  const checkout = {
    amount: 40,
    paymentUrl: 'https://checkout.example/pay',
    paymentId: 'tok_1',
  }

  it('keeps paid offline prepaid when sending remainder BePaid link', () => {
    const plan = planSendPaymentLinkUpdate(
      {
        prepaymentStatus: 'paid',
        prepaymentAmount: 60,
        paymentMethod: 'offline',
      },
      checkout,
    )
    expect(plan.mode).toBe('keep_paid_refresh_checkout')
    if (plan.mode === 'keep_paid_refresh_checkout') {
      expect(plan.paymentUrl).toBe(checkout.paymentUrl)
      expect(plan.paymentId).toBe(checkout.paymentId)
    }
  })

  it('keeps paid online status (does not downgrade to pending)', () => {
    const plan = planSendPaymentLinkUpdate(
      {
        prepaymentStatus: 'successful',
        prepaymentAmount: 100,
        paymentMethod: 'online',
      },
      checkout,
    )
    expect(plan.mode).toBe('keep_paid_refresh_checkout')
  })

  it('sets pending for unpaid orders', () => {
    const plan = planSendPaymentLinkUpdate(
      {
        prepaymentStatus: 'pending',
        prepaymentAmount: 0,
        paymentMethod: null,
      },
      checkout,
    )
    expect(plan).toEqual({
      mode: 'new_pending',
      prepaymentAmount: 40,
      prepaymentStatus: 'pending',
      paymentMethod: 'online',
      paymentUrl: checkout.paymentUrl,
      paymentId: checkout.paymentId,
    })
  })

  it('isPaidPrepaymentStatus recognizes paid/successful', () => {
    expect(isPaidPrepaymentStatus('paid')).toBe(true)
    expect(isPaidPrepaymentStatus('successful')).toBe(true)
    expect(isPaidPrepaymentStatus('pending')).toBe(false)
    expect(isPaidPrepaymentStatus(null)).toBe(false)
  })
})
