import { computeCashForReportDate } from '../utils/reportOrderCash'

describe('computeCashForReportDate', () => {
  it('returns 0 on work day when payment is on another day', () => {
    const cash = computeCashForReportDate(
      {
        prepaymentAmount: 50,
        prepaymentStatus: 'paid',
        created_at: '2025-05-30 12:00:00',
        prepaymentUpdatedAt: '2025-06-01 12:00:00',
        cash_from_issue_today: null,
      },
      '2025-05-30',
    )
    expect(cash).toBe(0)
  })

  it('returns prepayment on payment day', () => {
    const cash = computeCashForReportDate(
      {
        prepaymentAmount: 50,
        prepaymentStatus: 'paid',
        created_at: '2025-05-30 12:00:00',
        prepaymentUpdatedAt: '2025-06-01 12:00:00',
        cash_from_issue_today: null,
      },
      '2025-06-01',
    )
    expect(cash).toBe(50)
  })

  it('returns issue remainder on issue day for cross-day order', () => {
    const cash = computeCashForReportDate(
      {
        prepaymentAmount: 138,
        prepaymentStatus: 'paid',
        created_at: '2025-05-30 12:00:00',
        prepaymentUpdatedAt: '2025-06-01 12:00:00',
        cash_from_issue_today: 38,
      },
      '2025-06-01',
    )
    expect(cash).toBe(38)
  })
})
