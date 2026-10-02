import { planReplaceComponentReservations } from '../modules/orders/services/replaceOrderItemReservations'

describe('planReplaceComponentReservations', () => {
  it('разрешает перерезерв только active/reserved и отдаёт их как credit', () => {
    const plan = planReplaceComponentReservations([
      { id: 1, status: 'active' },
      { id: 2, status: 'reserved' },
      { id: 3, status: 'cancelled' },
    ])
    expect(plan.action).toBe('rereserve')
    expect(plan.activeIds).toEqual([1, 2])
    expect(plan.fulfilledIds).toEqual([])
  })

  it('блокирует replace, если склад уже списан (fulfilled)', () => {
    const plan = planReplaceComponentReservations([
      { id: 9, status: 'fulfilled' },
      { id: 10, status: 'active' },
    ])
    expect(plan.action).toBe('reject_fulfilled')
    expect(plan.fulfilledIds).toEqual([9])
  })
})
