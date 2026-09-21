import { isPaidPrepaymentStatus, planPrepayUpdate } from '../utils/prepayUpdate'

describe('planPrepayUpdate', () => {
  it('keeps paid offline prepaid when creating online BePaid checkout (remainder link)', () => {
    const plan = planPrepayUpdate(
      {
        prepaymentStatus: 'paid',
        prepaymentAmount: 100,
        paymentMethod: 'offline',
      },
      {
        amount: 50,
        paymentMethod: 'online',
        paymentUrl: 'https://checkout.example/pay',
        paymentId: 'tok_remainder',
      },
    )
    expect(plan).toEqual({
      mode: 'keep_paid_refresh_checkout',
      paymentUrl: 'https://checkout.example/pay',
      paymentId: 'tok_remainder',
    })
  })

  it('keeps paid online prepaid when recreating BePaid checkout', () => {
    const plan = planPrepayUpdate(
      {
        prepaymentStatus: 'successful',
        prepaymentAmount: 80,
        paymentMethod: 'online',
      },
      {
        amount: 20,
        paymentMethod: 'online',
        paymentUrl: 'https://checkout.example/again',
        paymentId: 'tok_2',
      },
    )
    expect(plan.mode).toBe('keep_paid_refresh_checkout')
  })

  it('replaces unpaid order with pending online checkout', () => {
    const plan = planPrepayUpdate(
      {
        prepaymentStatus: null,
        prepaymentAmount: 0,
        paymentMethod: null,
      },
      {
        amount: 120,
        paymentMethod: 'online',
        paymentUrl: 'https://checkout.example/new',
        paymentId: 'tok_new',
      },
    )
    expect(plan).toEqual({
      mode: 'replace',
      prepaymentAmount: 120,
      prepaymentStatus: 'pending',
      paymentMethod: 'online',
      paymentUrl: 'https://checkout.example/new',
      paymentId: 'tok_new',
      stampPrepaymentUpdatedAt: true,
    })
  })

  it('marks offline prepay as paid (replace)', () => {
    const plan = planPrepayUpdate(
      { prepaymentStatus: null, prepaymentAmount: 0 },
      {
        amount: 90,
        paymentMethod: 'offline',
        paymentUrl: null,
        paymentId: null,
      },
    )
    expect(plan).toMatchObject({
      mode: 'replace',
      prepaymentAmount: 90,
      prepaymentStatus: 'paid',
      paymentMethod: 'offline',
    })
  })

  it('isPaidPrepaymentStatus recognizes paid/successful', () => {
    expect(isPaidPrepaymentStatus('paid')).toBe(true)
    expect(isPaidPrepaymentStatus('successful')).toBe(true)
    expect(isPaidPrepaymentStatus('pending')).toBe(false)
  })
})
