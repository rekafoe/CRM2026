import { planIssuePaymentUpdate, isRemotePaymentMethod } from '../utils/issuePaymentUpdate'

describe('planIssuePaymentUpdate', () => {
  it('preserves online method and prepaymentUpdatedAt', () => {
    const plan = planIssuePaymentUpdate(
      { paymentMethod: 'online', prepaymentUpdatedAt: '2025-06-01 12:00:00' },
      { issueDateTime: '2025-06-03 12:00:00' },
    )
    expect(plan.paymentMethod).toBe('online')
    expect(plan.prepaymentUpdatedAt).toBe('2025-06-01 12:00:00')
    expect(isRemotePaymentMethod('online')).toBe(true)
  })

  it('preserves telegram method', () => {
    const plan = planIssuePaymentUpdate(
      { paymentMethod: 'telegram', prepaymentUpdatedAt: '2025-06-01 09:00:00' },
      { issueDateTime: '2025-06-03 12:00:00' },
    )
    expect(plan.paymentMethod).toBe('telegram')
    expect(plan.prepaymentUpdatedAt).toBe('2025-06-01 09:00:00')
  })

  it('sets offline and issue stamp for cash/unpaid orders', () => {
    const plan = planIssuePaymentUpdate(
      { paymentMethod: null, prepaymentUpdatedAt: null },
      { issueDateTime: '2025-06-03 12:00:00' },
    )
    expect(plan.paymentMethod).toBe('offline')
    expect(plan.prepaymentUpdatedAt).toBe('2025-06-03 12:00:00')
  })

  it('moves stamp to issue day for prior offline prepay (legacy cash path)', () => {
    const plan = planIssuePaymentUpdate(
      { paymentMethod: 'offline', prepaymentUpdatedAt: '2025-06-01 12:00:00' },
      { issueDateTime: '2025-06-03 12:00:00' },
    )
    expect(plan.paymentMethod).toBe('offline')
    expect(plan.prepaymentUpdatedAt).toBe('2025-06-03 12:00:00')
  })
})
