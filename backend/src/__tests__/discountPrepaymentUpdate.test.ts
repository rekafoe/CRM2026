import { planPrepaymentAfterDiscountChange } from '../utils/discountPrepaymentUpdate'

describe('planPrepaymentAfterDiscountChange', () => {
  it('does not inflate prepaid when discount is removed on a fully paid offline order', () => {
    // subtotal 100, was 20% off → paid 80; remove discount → total 100
    const plan = planPrepaymentAfterDiscountChange({
      paymentMethod: 'offline',
      prepaymentAmount: 80,
      oldTotal: 80,
      newTotal: 100,
    })
    expect(plan).toEqual({ action: 'leave' })
  })

  it('does not rewrite prepaid or cash day when applying a discount after full payment', () => {
    const plan = planPrepaymentAfterDiscountChange({
      paymentMethod: 'offline',
      prepaymentAmount: 100,
      oldTotal: 100,
      newTotal: 80,
    })
    expect(plan).toEqual({ action: 'leave' })
  })

  it('leaves partial prepay alone', () => {
    const plan = planPrepaymentAfterDiscountChange({
      paymentMethod: 'offline',
      prepaymentAmount: 30,
      oldTotal: 100,
      newTotal: 80,
    })
    expect(plan).toEqual({ action: 'leave' })
  })
})
