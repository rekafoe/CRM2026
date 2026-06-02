import {
  computeCashForReportDate,
  countsAsPaidForCashReport,
  isOrderExcludedFromCashRegister,
} from '../utils/reportOrderCash'

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

  it('counts offline prepayment without prepaymentStatus on payment day', () => {
    expect(
      countsAsPaidForCashReport({
        prepaymentAmount: 50,
        prepaymentStatus: null,
        paymentMethod: 'offline',
      }),
    ).toBe(true)
    const cash = computeCashForReportDate(
      {
        prepaymentAmount: 50,
        prepaymentStatus: null,
        paymentMethod: 'offline',
        created_at: '2025-05-30',
        prepaymentUpdatedAt: '2025-06-01',
      },
      '2025-06-01',
    )
    expect(cash).toBe(50)
  })

  it('excludes pool waiting status 0, not status 1 (оформлен)', () => {
    expect(isOrderExcludedFromCashRegister(0)).toBe(true)
    expect(isOrderExcludedFromCashRegister(1)).toBe(false)
  })
})
