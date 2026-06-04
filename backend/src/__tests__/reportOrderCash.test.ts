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

  it('counts issue remainder even when prepayment was pending (before issue)', () => {
    const cash = computeCashForReportDate(
      {
        prepaymentAmount: 138,
        prepaymentStatus: 'pending',
        paymentMethod: 'online',
        created_at: '2025-05-30',
        prepaymentUpdatedAt: '2025-05-30',
        cash_from_issue_today: 66,
      },
      '2025-06-01',
    )
    expect(cash).toBe(66)
  })

  it('counts prepayment on work day without prepaymentUpdatedAt (legacy CRM)', () => {
    const cash = computeCashForReportDate(
      {
        prepaymentAmount: 80,
        prepaymentStatus: 'paid',
        paymentMethod: 'offline',
        created_at: '2025-06-02 10:00:00',
        prepaymentUpdatedAt: null,
        cash_from_issue_today: null,
      },
      '2025-06-02',
    )
    expect(cash).toBe(80)
  })

  it('counts prepayment on payment day when status pending but updated today (CRM)', () => {
    expect(
      countsAsPaidForCashReport(
        {
          prepaymentAmount: 40,
          prepaymentStatus: 'pending',
          paymentMethod: null,
          prepaymentUpdatedAt: '2025-06-03 12:00:00',
        },
        '2025-06-03',
      ),
    ).toBe(true)
    const cash = computeCashForReportDate(
      {
        prepaymentAmount: 40,
        prepaymentStatus: 'pending',
        paymentMethod: null,
        created_at: '2025-06-01',
        prepaymentUpdatedAt: '2025-06-03 12:00:00',
        cash_from_issue_today: null,
      },
      '2025-06-03',
    )
    expect(cash).toBe(40)
  })
})
