import { planPrepaymentAfterItemTotalChange } from '../utils/itemTotalPrepaymentUpdate'

describe('planPrepaymentAfterItemTotalChange', () => {
  it('никогда не синхронизирует prepaid с новым итогом позиции', () => {
    const plan = planPrepaymentAfterItemTotalChange({
      paymentMethod: 'offline',
      prepaymentAmount: 100,
      oldTotal: 100,
      newTotal: 150,
    })
    expect(plan.action).toBe('leave_prepaid_unchanged')
  })

  it('не двигает день кассы при уменьшении итога (удаление/правка)', () => {
    const plan = planPrepaymentAfterItemTotalChange({
      paymentMethod: 'offline',
      prepaymentAmount: 100,
      oldTotal: 100,
      newTotal: 60,
    })
    expect(plan.action).toBe('leave_prepaid_unchanged')
  })
})
