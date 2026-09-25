import { planCreateOrderPrepayment } from '../utils/planCreateOrderPrepayment'

describe('planCreateOrderPrepayment', () => {
  it('website ignores client prepaymentAmount (no invent paid)', () => {
    const plan = planCreateOrderPrepayment({
      source: 'website',
      prepaymentAmount: 10.5,
      paymentMethodHint: null,
    })
    expect(plan.prepaymentAmount).toBe(0)
    expect(plan.prepaymentStatus).toBeNull()
    expect(plan.paymentMethod).toBeUndefined()
    expect(plan.stampPrepaymentUpdatedAt).toBe(false)
  })

  it('website online stays pending with zero prepaid until BePaid/confirm', () => {
    const plan = planCreateOrderPrepayment({
      source: 'website',
      prepaymentAmount: 42,
      paymentMethodHint: 'online',
    })
    expect(plan.prepaymentAmount).toBe(0)
    expect(plan.prepaymentStatus).toBe('pending')
    expect(plan.paymentMethod).toBe('online')
    expect(plan.stampPrepaymentUpdatedAt).toBe(true)
  })

  it('mini_app ignores client prepaymentAmount even with offline hint', () => {
    const plan = planCreateOrderPrepayment({
      source: 'mini_app',
      prepaymentAmount: 99,
      paymentMethodHint: 'offline',
    })
    expect(plan.prepaymentAmount).toBe(0)
    expect(plan.prepaymentStatus).toBeNull()
    expect(plan.paymentMethod).toBeNull()
  })

  it('CRM with amount > 0 still marks paid (operator-entered prepaid)', () => {
    const plan = planCreateOrderPrepayment({
      source: 'crm',
      prepaymentAmount: 15,
      paymentMethodHint: null,
    })
    expect(plan.prepaymentAmount).toBe(15)
    expect(plan.prepaymentStatus).toBe('paid')
    expect(plan.paymentMethod).toBe('offline')
    expect(plan.stampPrepaymentUpdatedAt).toBe(true)
  })

  it('CRM online hint with zero amount → pending', () => {
    const plan = planCreateOrderPrepayment({
      source: 'crm',
      prepaymentAmount: 0,
      paymentMethodHint: 'online',
    })
    expect(plan.prepaymentAmount).toBe(0)
    expect(plan.prepaymentStatus).toBe('pending')
    expect(plan.paymentMethod).toBe('online')
  })
})
