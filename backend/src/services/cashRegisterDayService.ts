import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'
import { sqlOrderTotalAfterDiscount } from '../utils/orderAmountsSql'
import {
  isOrderExcludedFromCashRegister,
  shouldIncludeOrderInCashRegister,
} from '../utils/reportOrderCash'
import {
  loadDailyOrdersForCashReport,
  type DailyOrderForCashReport,
} from './loadDailyOrdersForCashReport'
import { logger } from '../utils/logger'

export type CashRegisterContribution = {
  user_id: number
  user_name?: string
  amount: number
}

export type CashRegisterOrderDiagnostic = {
  id: number
  number?: string
  cash_for_report_date: number
  prepaymentAmount?: number | null
  prepaymentUpdatedAt?: string | null
  prepaymentStatus?: string | null
  payment_channel?: string | null
  paymentMethod?: string | null
  status?: number
}

export type CashRegisterDayPayload = {
  date: string
  cash_in_today: number
  issued_today: number
  issued_by_operators: Array<{ user_id: number; user_name: string; amount: number }>
  contributions_by_user: CashRegisterContribution[]
  order_volume_work_day: number
  orders_included_count: number
  orders_zero_cash: CashRegisterOrderDiagnostic[]
}

function aggregateCashFromOrders(
  orders: DailyOrderForCashReport[],
  reportDate: string,
): {
  cash_in_today: number
  contributions_by_user: CashRegisterContribution[]
  orders_included: DailyOrderForCashReport[]
  orders_zero_cash: CashRegisterOrderDiagnostic[]
} {
  const contributionsByUser = new Map<number, number>()
  let cashInToday = 0
  const ordersIncluded: DailyOrderForCashReport[] = []
  const ordersZeroCash: CashRegisterOrderDiagnostic[] = []

  for (const order of orders) {
    const cashIncrement = Number(order.cash_for_report_date ?? 0)
    if (!shouldIncludeOrderInCashRegister(order, reportDate, cashIncrement)) {
      if (
        !isOrderExcludedFromCashRegister(order.status) &&
        (Number(order.prepaymentAmount ?? 0) > 0 || order.cash_from_issue_today != null)
      ) {
        ordersZeroCash.push({
          id: order.id,
          number: order.number,
          cash_for_report_date: cashIncrement,
          prepaymentAmount: order.prepaymentAmount,
          prepaymentUpdatedAt: order.prepaymentUpdatedAt,
          prepaymentStatus: order.prepaymentStatus,
          payment_channel: order.payment_channel,
          paymentMethod: order.paymentMethod,
          status: order.status,
        })
      }
      continue
    }

    if (cashIncrement <= 0) {
      if (
        !isOrderExcludedFromCashRegister(order.status) &&
        (Number(order.prepaymentAmount ?? 0) > 0 || Number(order.cash_from_issue_today ?? 0) > 0)
      ) {
        ordersZeroCash.push({
          id: order.id,
          number: order.number,
          cash_for_report_date: cashIncrement,
          prepaymentAmount: order.prepaymentAmount,
          prepaymentUpdatedAt: order.prepaymentUpdatedAt,
          prepaymentStatus: order.prepaymentStatus,
          payment_channel: order.payment_channel,
          paymentMethod: order.paymentMethod,
          status: order.status,
        })
      }
      continue
    }

    ordersIncluded.push(order)
    const issuedAmount = Number(order.cash_from_issue_today ?? 0)
    const nonIssueAmount = Number.isFinite(issuedAmount)
      ? Math.max(0, cashIncrement - issuedAmount)
      : cashIncrement

    const rawUserId = order.userId ?? order.user_id ?? null
    const userId = rawUserId != null ? Number(rawUserId) : null
    if (userId && !Number.isNaN(userId) && nonIssueAmount > 0) {
      contributionsByUser.set(userId, (contributionsByUser.get(userId) || 0) + nonIssueAmount)
    }
    const issuerId = Number(order.cash_issued_by_user_id)
    if (issuerId > 0 && Number.isFinite(issuedAmount) && issuedAmount > 0) {
      contributionsByUser.set(issuerId, (contributionsByUser.get(issuerId) || 0) + issuedAmount)
    }

    cashInToday += cashIncrement
  }

  const contributions_by_user: CashRegisterContribution[] = Array.from(contributionsByUser.entries()).map(
    ([user_id, amount]) => ({ user_id, amount }),
  )

  return {
    cash_in_today: Math.round(cashInToday * 100) / 100,
    contributions_by_user,
    orders_included: ordersIncluded,
    orders_zero_cash: ordersZeroCash,
  }
}

async function loadOrderVolumeWorkDay(reportDate: string): Promise<number> {
  const d = reportDate.slice(0, 10)
  const db = await getDb()
  const totalExpr = sqlOrderTotalAfterDiscount('o.id', 'COALESCE(o.discount_percent, 0)')
  const row = await db.get<{ s: number }>(
    `SELECT COALESCE(SUM(${totalExpr}), 0) as s
       FROM orders o
      WHERE substr(COALESCE(o.created_at, o.createdAt), 1, 10) = ?
        AND o.status != 0`,
    d,
  )
  return Math.round(Number(row?.s ?? 0) * 100) / 100
}

export async function getCashRegisterDay(reportDate: string): Promise<CashRegisterDayPayload> {
  await backfillPaymentMetadataForCashDay(reportDate)
  const loaded = await loadDailyOrdersForCashReport(reportDate)
  const agg = aggregateCashFromOrders(loaded.orders, loaded.date)
  const order_volume_work_day = await loadOrderVolumeWorkDay(loaded.date)

  return {
    date: loaded.date,
    cash_in_today: agg.cash_in_today,
    issued_today: loaded.issued_orders_total,
    issued_by_operators: loaded.issued_by_operators,
    contributions_by_user: agg.contributions_by_user,
    order_volume_work_day,
    orders_included_count: agg.orders_included.length,
    orders_zero_cash: agg.orders_zero_cash,
  }
}

/** Консервативный backfill метаданных оплаты для заказов за день отчёта. */
export async function backfillPaymentMetadataForCashDay(reportDate: string): Promise<number> {
  const d = reportDate.slice(0, 10)
  const db = await getDb()

  let hasPrepaymentUpdatedAt = false
  try {
    hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt')
  } catch {
    hasPrepaymentUpdatedAt = false
  }

  if (!hasPrepaymentUpdatedAt) {
    return 0
  }

  type BackfillRow = {
    id: number
    created_at: string | null
    prepaymentAmount: number | null
    prepaymentStatus: string | null
    paymentMethod: string | null
    updated_ts?: string | null
  }

  const paidFilter = `COALESCE(o.prepaymentAmount, 0) > 0
        AND o.prepaymentUpdatedAt IS NULL
        AND COALESCE(o.prepaymentStatus, '') NOT IN ('pending')
        AND LOWER(COALESCE(o.paymentMethod, '')) NOT IN ('online', 'telegram')`

  const candidates = (await db.all(
    `SELECT o.id,
            COALESCE(o.created_at, o.createdAt) as created_at,
            o.prepaymentAmount,
            o.prepaymentStatus,
            o.paymentMethod
       FROM orders o
      WHERE substr(COALESCE(o.created_at, o.createdAt), 1, 10) = ?
        AND ${paidFilter}`,
    d,
  )) as BackfillRow[]

  let hasUpdatedAt = false
  let hasUpdatedAtCamel = false
  try {
    hasUpdatedAt = await hasColumn('orders', 'updated_at')
    hasUpdatedAtCamel = await hasColumn('orders', 'updatedAt')
  } catch {
    /* ignore */
  }
  const updatedAtExpr =
    hasUpdatedAt && hasUpdatedAtCamel
      ? 'COALESCE(o.updated_at, o.updatedAt)'
      : hasUpdatedAt
        ? 'o.updated_at'
        : hasUpdatedAtCamel
          ? 'o.updatedAt'
          : null

  let paymentDayCandidates: BackfillRow[] = []
  if (updatedAtExpr) {
    paymentDayCandidates = (await db.all(
      `SELECT o.id,
              COALESCE(o.created_at, o.createdAt) as created_at,
              o.prepaymentAmount,
              o.prepaymentStatus,
              o.paymentMethod,
              ${updatedAtExpr} as updated_ts
         FROM orders o
        WHERE substr(${updatedAtExpr}, 1, 10) = ?
          AND substr(COALESCE(o.created_at, o.createdAt), 1, 10) != ?
          AND ${paidFilter}`,
      d,
      d,
    )) as BackfillRow[]
  }

  const seen = new Set<number>()
  let updated = 0

  const applyBackfill = async (row: BackfillRow, stamp: string) => {
    if (seen.has(row.id)) return
    const method = String(row.paymentMethod ?? '').toLowerCase()
    if (method === 'online' || method === 'telegram') return
    const status = String(row.prepaymentStatus ?? '').toLowerCase()
    if (status === 'pending') return

    seen.add(row.id)
    await db.run(
      `UPDATE orders
          SET prepaymentStatus = COALESCE(NULLIF(prepaymentStatus, ''), 'paid'),
              paymentMethod = COALESCE(NULLIF(paymentMethod, ''), 'offline'),
              prepaymentUpdatedAt = ?,
              updated_at = datetime('now','localtime')
        WHERE id = ?`,
      stamp,
      row.id,
    )
    updated += 1
  }

  for (const row of candidates) {
    const created = String(row.created_at ?? '').trim()
    const stamp = created.length >= 10 ? `${created.slice(0, 10)} 12:00:00` : `${d} 12:00:00`
    await applyBackfill(row, stamp)
  }

  for (const row of paymentDayCandidates) {
    const updatedTs = String(row.updated_ts ?? '').trim()
    const stamp =
      updatedTs.length >= 10 ? `${updatedTs.slice(0, 19).replace('T', ' ')}` : `${d} 12:00:00`
    await applyBackfill(row, stamp.length >= 10 ? stamp : `${d} 12:00:00`)
  }

  if (updated > 0) {
    logger.info('cashRegisterDayService backfill', { date: d, updated })
  }

  return updated
}

export async function recalculateCashRegisterDay(reportDate: string): Promise<CashRegisterDayPayload & { backfill_updated: number }> {
  const backfill_updated = await backfillPaymentMetadataForCashDay(reportDate)
  const payload = await getCashRegisterDay(reportDate)
  return { ...payload, backfill_updated }
}
