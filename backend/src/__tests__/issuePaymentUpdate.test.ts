import { planIssuePaymentUpdate } from '../utils/issuePaymentUpdate'

describe('planIssuePaymentUpdate', () => {
  const issueDateTime = '2026-09-09 12:00:00'

  it('keeps existing offline prepaymentUpdatedAt (do not move cash day on issue)', () => {
    const plan = planIssuePaymentUpdate(
      {
        paymentMethod: 'offline',
        prepaymentUpdatedAt: '2026-09-01 12:00:00',
      },
      { issueDateTime },
    )
    expect(plan.paymentMethod).toBe('offline')
    expect(plan.prepaymentUpdatedAt).toBe('2026-09-01 12:00:00')
  })

  it('sets issue day stamp when offline had no prepaymentUpdatedAt', () => {
    const plan = planIssuePaymentUpdate(
      { paymentMethod: 'offline', prepaymentUpdatedAt: null },
      { issueDateTime },
    )
    expect(plan.paymentMethod).toBe('offline')
    expect(plan.prepaymentUpdatedAt).toBe(issueDateTime)
  })

  it('preserves online method and existing stamp', () => {
    const plan = planIssuePaymentUpdate(
      {
        paymentMethod: 'online',
        prepaymentUpdatedAt: '2026-09-02 15:00:00',
      },
      { issueDateTime },
    )
    expect(plan.paymentMethod).toBe('online')
    expect(plan.prepaymentUpdatedAt).toBe('2026-09-02 15:00:00')
  })
})
