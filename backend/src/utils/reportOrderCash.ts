/** Календарная дата YYYY-MM-DD из timestamp (как substr в SQL-отчётах). */
export function sliceReportDate(value: string | null | undefined): string {
  if (value == null || value === '') return ''
  return String(value).trim().slice(0, 10)
}

/** Календарная дата в локальной зоне (для сопоставления с днём отчёта в UI). */
export function sliceReportDateLocal(value: string | null | undefined): string {
  if (value == null || value === '') return ''
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s.slice(0, 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
  payment_channel?: string | null
  created_at?: string | null
  createdAt?: string | null
  prepaymentUpdatedAt?: string | null
  cash_from_issue_today?: number | null
}

/** Оплата для кассы: paid/successful, офлайн, предоплата в день отчёта (CRM), без online/telegram. */
export function countsAsPaidForCashReport(order: OrderCashInput, reportDate?: string): boolean {
  if (isPaidPrepaymentStatus(order.prepaymentStatus)) return true
  const prepayment = Number(order.prepaymentAmount ?? 0)
  if (!Number.isFinite(prepayment) || prepayment <= 0) return false
  const method = String(order.paymentMethod ?? '').toLowerCase()
  if (method === 'offline') return true
  const rd = reportDate?.slice(0, 10)
  if (rd) {
    const prepayDay = sliceReportDateLocal(order.prepaymentUpdatedAt)
    if (prepayDay === rd && method !== 'online' && method !== 'telegram') return true
  }
  if (!order.prepaymentStatus && method !== 'online' && method !== 'telegram') return true
  return false
}

/** Внутренние заказы и «счёт» без движения в кассу за день — не в выручку. */
export function shouldIncludeOrderInCashRegister(order: OrderCashInput, reportDate: string, cashIncrement: number): boolean {
  const channel = String(order.payment_channel ?? 'cash').toLowerCase()
  if (channel === 'internal') return false
  if (cashIncrement > 0) return true
  return channel === 'cash'
}

/**
 * Сумма в кассу за конкретный календарный день отчёта.
 * День работы (created_at) без оплаты в этот день → 0.
 * День оплаты (prepaymentUpdatedAt) → prepaymentAmount.
 * День выдачи (cash_from_issue_today) → остаток (всегда, если debt_closed > 0).
 */
export function computeCashForReportDate(order: OrderCashInput, reportDate: string): number {
  const rd = reportDate.slice(0, 10)
  const issueRaw = order.cash_from_issue_today
  const hasIssue = issueRaw !== null && issueRaw !== undefined
  const issueAmt = hasIssue ? Number(issueRaw) : NaN

  if (hasIssue && Number.isFinite(issueAmt) && issueAmt > 0) {
    const prepayment = Number(order.prepaymentAmount ?? 0)
    const created = sliceReportDateLocal(order.created_at ?? order.createdAt)
    if (created === rd && Number.isFinite(prepayment) && prepayment > 0) {
      if (issueAmt < prepayment) return prepayment
      if (issueAmt === 0 && prepayment > 0) return prepayment
    }
    return Math.max(0, issueAmt)
  }

  const prepayment = Number(order.prepaymentAmount ?? 0)
  if (!Number.isFinite(prepayment) || prepayment <= 0) return 0
  if (!countsAsPaidForCashReport(order, rd)) return 0

  const prepayDay = sliceReportDateLocal(order.prepaymentUpdatedAt)
  if (prepayDay === rd) return prepayment

  const created = sliceReportDateLocal(order.created_at ?? order.createdAt)
  // Legacy CRM: оплата в день оформления без prepaymentUpdatedAt
  if (!prepayDay && created === rd) return prepayment

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
