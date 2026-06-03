import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'
import { OrderRepository } from '../repositories/orderRepository'
import { computeCashForReportDate, sqlDailyOrderDayFilter } from '../utils/reportOrderCash'

export type DailyOrderForCashReport = {
  id: number
  number?: string
  status?: number
  created_at?: string
  createdAt?: string
  prepaymentUpdatedAt?: string | null
  customerName?: string | null
  prepaymentAmount?: number | null
  prepaymentStatus?: string | null
  paymentMethod?: string | null
  payment_channel?: string | null
  userId?: number | null
  user_id?: number | null
  cash_from_issue_today?: number | null
  cash_issued_by_user_id?: number | null
  cash_for_report_date?: number
  items?: unknown[]
}

export type IssuedByOperatorRow = {
  user_id: number
  user_name: string
  amount: number
}

export type LoadDailyOrdersResult = {
  date: string
  orders: DailyOrderForCashReport[]
  issued_orders_total: number
  issued_by_operators: IssuedByOperatorRow[]
}

export async function loadDailyOrdersForCashReport(reportDate: string): Promise<LoadDailyOrdersResult> {
  const d = String(reportDate || '').slice(0, 10)
  const db = await getDb()

  let hasPrepaymentUpdatedAt = false
  try {
    hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt')
  } catch {
    hasPrepaymentUpdatedAt = false
  }
  const prepaymentUpdatedAtSelect = hasPrepaymentUpdatedAt ? 'o.prepaymentUpdatedAt' : 'NULL as prepaymentUpdatedAt'

  let hasPaymentChannel = false
  let hasIsInternal = false
  let hasNotes = false
  try {
    hasPaymentChannel = await hasColumn('orders', 'payment_channel')
    hasIsInternal = await hasColumn('orders', 'is_internal')
    hasNotes = await hasColumn('orders', 'notes')
  } catch {
    /* ignore */
  }
  const paymentChannelSelect = hasPaymentChannel
    ? hasIsInternal
      ? "CASE WHEN COALESCE(o.is_internal,0)=1 THEN 'internal' ELSE COALESCE(o.payment_channel, 'cash') END as payment_channel"
      : "COALESCE(o.payment_channel, 'cash') as payment_channel"
    : "'cash' as payment_channel"
  const notesSelect = hasNotes ? 'o.notes' : 'NULL as notes'

  let hasDebtClosed = false
  try {
    hasDebtClosed = !!(await db.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='debt_closed_events'"))
  } catch {
    /* ignore */
  }

  const dayFilter = sqlDailyOrderDayFilter(d, {
    hasPrepaymentUpdatedAt,
    hasDebtClosed,
    tableAlias: 'o',
  })

  const orders = (await db.all(
    `SELECT o.id, o.number, o.status,
            COALESCE(o.created_at, o.createdAt) as created_at,
            ${prepaymentUpdatedAtSelect},
            o.customerName, o.customerPhone, o.customerEmail,
            o.prepaymentAmount, o.prepaymentStatus, o.paymentMethod, o.userId,
            ${paymentChannelSelect},
            ${notesSelect}
       FROM orders o
      WHERE ${dayFilter.whereSql}
      ORDER BY o.id DESC`,
    ...dayFilter.params,
  )) as DailyOrderForCashReport[]

  const orderIds = orders.map((o) => o.id)
  const itemsByOrderId = await OrderRepository.getItemsByOrderIds(orderIds)
  for (const order of orders) {
    const items = itemsByOrderId.get(order.id) ?? []
    order.items = items.map((item: { params?: unknown }) => ({
      ...item,
      params: item.params && typeof item.params === 'object' ? item.params : {},
    }))
  }

  if (hasDebtClosed) {
    try {
      const hasIssuedBy = await hasColumn('debt_closed_events', 'issued_by_user_id')
      const debtRows = (await db.all(
        hasIssuedBy
          ? 'SELECT order_id, amount, issued_by_user_id FROM debt_closed_events WHERE closed_date = ?'
          : 'SELECT order_id, amount, NULL as issued_by_user_id FROM debt_closed_events WHERE closed_date = ?',
        d,
      )) as Array<{ order_id: number; amount: number; issued_by_user_id: number | null }>
      const byOrder = new Map<number, { amount: number; issuedBy: number | null }>()
      for (const r of debtRows) {
        byOrder.set(Number(r.order_id), {
          amount: Number(r.amount),
          issuedBy: r.issued_by_user_id == null ? null : Number(r.issued_by_user_id),
        })
      }
      for (const order of orders) {
        const issue = byOrder.get(Number(order.id))
        order.cash_from_issue_today = issue ? issue.amount : null
        order.cash_issued_by_user_id = issue ? issue.issuedBy : null
      }
    } catch {
      for (const order of orders) {
        order.cash_from_issue_today = null
        order.cash_issued_by_user_id = null
      }
    }
  } else {
    for (const order of orders) {
      order.cash_from_issue_today = null
      order.cash_issued_by_user_id = null
    }
  }

  for (const order of orders) {
    order.cash_for_report_date = computeCashForReportDate(order, d)
  }

  let issuedOrdersTotal = 0
  let issuedByOperators: IssuedByOperatorRow[] = []
  if (hasDebtClosed) {
    try {
      const hasIssuedBy = await hasColumn('debt_closed_events', 'issued_by_user_id')
      const row = await db.get<{ s: number }>(
        'SELECT COALESCE(SUM(amount), 0) AS s FROM debt_closed_events WHERE closed_date = ?',
        d,
      )
      issuedOrdersTotal = Number(row?.s ?? 0)
      if (hasIssuedBy) {
        const rows = (await db.all(
          `SELECT d.issued_by_user_id as user_id, COALESCE(u.name, u.email, 'Без оператора') as user_name, SUM(d.amount) as amount
           FROM debt_closed_events d
           LEFT JOIN users u ON u.id = d.issued_by_user_id
           WHERE d.closed_date = ? AND d.issued_by_user_id IS NOT NULL
           GROUP BY d.issued_by_user_id
           ORDER BY amount DESC`,
          d,
        )) as Array<{ user_id: number; user_name: string; amount: number }>
        issuedByOperators = rows.map((r) => ({
          user_id: Number(r.user_id),
          user_name: r.user_name || `ID ${r.user_id}`,
          amount: Number(r.amount ?? 0),
        }))
        const nullRow = await db.get<{ s: number }>(
          'SELECT COALESCE(SUM(amount), 0) AS s FROM debt_closed_events WHERE closed_date = ? AND issued_by_user_id IS NULL',
          d,
        )
        const nullAmount = Number(nullRow?.s ?? 0)
        if (nullAmount > 0) {
          issuedByOperators.push({ user_id: 0, user_name: 'Без оператора', amount: nullAmount })
        }
      }
    } catch {
      /* ignore */
    }
  }

  return {
    date: d,
    orders,
    issued_orders_total: issuedOrdersTotal,
    issued_by_operators: issuedByOperators,
  }
}
