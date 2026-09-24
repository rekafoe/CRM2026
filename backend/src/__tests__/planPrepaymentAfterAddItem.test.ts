import { planPrepaymentAfterAddItem } from '../utils/planPrepaymentAfterAddItem'

describe('planPrepaymentAfterAddItem', () => {
  it('does not invent prepaid when paymentMethod is SQLite DEFAULT online', () => {
    const plan = planPrepaymentAfterAddItem({
      paymentMethod: 'online',
      prepaymentAmount: 0,
      prepaymentStatus: null,
      oldTotal: 0,
      newTotal: 120,
    })
    expect(plan.shouldSet).toBe(false)
  })

  it('does not invent prepaid when paymentMethod is null (CRM create after fix)', () => {
    const plan = planPrepaymentAfterAddItem({
      paymentMethod: null,
      prepaymentAmount: 0,
      prepaymentStatus: null,
      oldTotal: 0,
      newTotal: 120,
    })
    expect(plan.shouldSet).toBe(false)
  })

  it('sets prepaid on first item for explicit offline', () => {
    const plan = planPrepaymentAfterAddItem({
      paymentMethod: 'offline',
      prepaymentAmount: 0,
      prepaymentStatus: null,
      oldTotal: 0,
      newTotal: 80,
    })
    expect(plan).toEqual({ shouldSet: true, amount: 80 })
  })

  it('syncs prepaid up when offline and previously in sync with old total', () => {
    const plan = planPrepaymentAfterAddItem({
      paymentMethod: 'offline',
      prepaymentAmount: 50,
      prepaymentStatus: 'paid',
      oldTotal: 50,
      newTotal: 90,
    })
    expect(plan).toEqual({ shouldSet: true, amount: 90 })
  })

  it('leaves partial offline prepaid alone when not in sync', () => {
    const plan = planPrepaymentAfterAddItem({
      paymentMethod: 'offline',
      prepaymentAmount: 20,
      prepaymentStatus: 'paid',
      oldTotal: 100,
      newTotal: 150,
    })
    expect(plan.shouldSet).toBe(false)
    expect(plan.amount).toBe(20)
  })
})
