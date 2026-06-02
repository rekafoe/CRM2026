/** Календарная дата YYYY-MM-DD из timestamp (как substr в SQL-отчётах). */
export function sliceReportDate(value: string | null | undefined): string {
  if (value == null || value === '') return ''
  return String(value).trim().slice(0, 10)
}

export function isPaidPrepaymentStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').toLowerCase()
  return s === 'paid' || s === 'successful'
}

/** Заказ в пуле «Ожидает» (id=0) — не в выручку кассы. id=1 — «Оформлен», учитывается. */
export function isOrderExcludedFromCashRegister(status: number | string | null | undefined): boolean {
  return Number(status) === 0
}

export type OrderCashInput = {
  prepaymentAmount?: number | string | null
  prepaymentStatus?: string | null
  paymentMethod?: string | null
  created_at?: string | null
  createdAt?: string | null
  prepaymentUpdatedAt?: string | null
  cash_from_issue_today?: number | null
}

/** Оплата для кассы: paid/successful, офлайн с суммой, или CRM без статуса (не online/telegram). */
export function countsAsPaidForCashReport(order: OrderCashInput): boolean {
  if (isPaidPrepaymentStatus(order.prepaymentStatus)) return true
  const prepayment = Number(order.prepaymentAmount ?? 0)
  if (!Number.isFinite(prepayment) || prepayment <= 0) return false
  const method = String(order.paymentMethod ?? '').toLowerCase()
  if (method === 'offline') return true
  if (!order.prepaymentStatus && method !== 'online' && method !== 'telegram') return true
  return false
}

/**
 * Сумма в кассу за конкретный календарный день отчёта.
 * День работы (created_at) без оплаты в этот день → 0.
 * День оплаты (prepaymentUpdatedAt) → prepaymentAmount.
 * День выдачи (cash_from_issue_today) → остаток или полная сумма по правилам выдачи.
 */
export function computeCashForReportDate(order: OrderCashInput, reportDate: string): number {
  const rd = reportDate.slice(0, 10)
  const prepayment = Number(order.prepaymentAmount ?? 0)
  if (!Number.isFinite(prepayment) || prepayment <= 0) return 0
  if (!countsAsPaidForCashReport(order)) return 0

  const created = sliceReportDate(order.created_at ?? order.createdAt)
  const prepayDay = sliceReportDate(order.prepaymentUpdatedAt)
  const issueRaw = order.cash_from_issue_today
  const hasIssue = issueRaw !== null && issueRaw !== undefined
  const issueAmt = hasIssue ? Number(issueRaw) : NaN

  if (hasIssue && Number.isFinite(issueAmt)) {
    if (created === rd) {
      if (issueAmt < prepayment) return prepayment
      if (issueAmt === 0 && prepayment > 0) return prepayment
    }
    return Math.max(0, issueAmt)
  }

  if (prepayDay === rd) return prepayment
  return 0
}

export type DailyOrderDayFilterOptions = {
  hasPrepaymentUpdatedAt: boolean
  hasDebtClosed: boolean
  tableAlias?: string
}

/** SQL-фильтр: заказ попадает в день отчёта по дате работы, оплаты или выдачи. */
export function sqlDailyOrderDayFilter(
  reportDate: string,
  options: DailyOrderDayFilterOptions,
): { whereSql: string; params: string[] } {
  const a = options.tableAlias ?? 'o'
  const d = reportDate.slice(0, 10)
  const parts: string[] = [`substr(COALESCE(${a}.created_at, ${a}.createdAt), 1, 10) = ?`]
  const params: string[] = [d]

  if (options.hasPrepaymentUpdatedAt) {
    parts.push(
      `(substr(${a}.prepaymentUpdatedAt, 1, 10) = ? AND COALESCE(${a}.prepaymentAmount, 0) > 0)`,
    )
    params.push(d)
  }
  if (options.hasDebtClosed) {
    parts.push(
      `EXISTS (SELECT 1 FROM debt_closed_events dce WHERE dce.order_id = ${a}.id AND dce.closed_date = ?)`,
    )
    params.push(d)
  }

  return { whereSql: `(${parts.join(' OR ')})`, params }
}
