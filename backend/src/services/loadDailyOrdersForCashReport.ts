import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'
import { hasFulfillmentDepartmentColumn, scopeByFulfillmentDepartment } from '../utils/orderFulfillmentScope'
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

export type LoadDailyOrdersOptions = {
  /** Позиции нужны только для UI заказов/кликов. Касса считает суммы без items. */
  includeItems?: boolean
}

async function resolveItemsPrinterColumn(): Promise<string> {
  try {
    if (await hasColumn('items', 'printerId')) return 'printerId'
    if (await hasColumn('items', 'printer_id')) return 'printer_id'
  } catch {
    /* ignore */
  }
  return 'printerId'
}

/**
 * Ожидаемые клики по принтерам за день отчёта (без выгрузки всех позиций).
 * Как в UI: не считаем клики у заказов, выданных сегодня, но оформленных в другой день.
 */
export async function loadPrinterExpectedClicksForDay(
  reportDate: string,
  departmentId?: number,
): Promise<Record<number, number>> {
  const d = String(reportDate || '').slice(0, 10)
  if (!d) return {}

  const db = await getDb()
  const printerCol = await resolveItemsPrinterColumn()
  if (printerCol !== 'printerId' && printerCol !== 'printer_id') return {}

  const columnExists = await hasFulfillmentDepartmentColumn()
  const fulfillmentScope = scopeByFulfillmentDepartment('o', departmentId, { columnExists })

  let hasPrepaymentUpdatedAt = false
  try {
    hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt')
  } catch {
    hasPrepaymentUpdatedAt = false
  }

  let hasDebtClosed = false
  try {
    hasDebtClosed = !!(await db.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='debt_closed_events'"))
  } catch {
    hasDebtClosed = false
  }

  const dayFilter = sqlDailyOrderDayFilter(d, {
    hasPrepaymentUpdatedAt,
    hasDebtClosed,
    tableAlias: 'o',
  })

  const skipIssuedOtherDaySql = hasDebtClosed
    ? `AND NOT (
         EXISTS (SELECT 1 FROM debt_closed_events dce WHERE dce.order_id = o.id AND dce.closed_date = ?)
         AND substr(COALESCE(o.created_at, o.createdAt), 1, 10) != ?
       )`
    : ''
  const skipIssuedOtherDayParams = hasDebtClosed ? [d, d] : []

  const clickExpr = `CASE
    WHEN COALESCE(i.clicks, 0) > 0 THEN COALESCE(i.clicks, 0)
    ELSE CASE WHEN COALESCE(i.sheets, 0) < 0 THEN 0 ELSE COALESCE(i.sheets, 0) END
         * ((CASE WHEN COALESCE(i.sides, 1) < 1 THEN 1 ELSE COALESCE(i.sides, 1) END) * 2)
  END`

  try {
    const rows = (await db.all(
      `SELECT i.${printerCol} as printer_id, COALESCE(SUM(${clickExpr}), 0) as clicks
         FROM items i
         JOIN orders o ON o.id = i.orderId
        WHERE ${dayFilter.whereSql}
          ${fulfillmentScope.clause}
          AND i.${printerCol} IS NOT NULL
          AND CAST(i.${printerCol} AS INTEGER) != 0
          ${skipIssuedOtherDaySql}
        GROUP BY i.${printerCol}`,
      ...dayFilter.params,
      ...fulfillmentScope.params,
      ...skipIssuedOtherDayParams,
    )) as Array<{ printer_id: number; clicks: number }>

    const out: Record<number, number> = {}
    for (const row of rows) {
      const id = Number(row.printer_id)
      if (!Number.isFinite(id) || id <= 0) continue
      out[id] = Number(row.clicks ?? 0)
    }
    return out
  } catch {
    return {}
  }
}

export async function loadDailyOrdersForCashReport(
  reportDate: string,
  departmentId?: number,
  options?: LoadDailyOrdersOptions,
): Promise<LoadDailyOrdersResult> {
  const d = String(reportDate || '').slice(0, 10)
  const db = await getDb()
  const columnExists = await hasFulfillmentDepartmentColumn()
  const fulfillmentScope = scopeByFulfillmentDepartment('o', departmentId, { columnExists })

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
        ${fulfillmentScope.clause}
      ORDER BY o.id DESC`,
    ...dayFilter.params,
    ...fulfillmentScope.params,
  )) as DailyOrderForCashReport[]

  if (options?.includeItems) {
    const orderIds = orders.map((o) => o.id)
    const itemsByOrderId = await OrderRepository.getItemsByOrderIds(orderIds)
    for (const order of orders) {
      const items = itemsByOrderId.get(order.id) ?? []
      order.items = items.map((item: { params?: unknown }) => ({
        ...item,
        params: item.params && typeof item.params === 'object' ? item.params : {},
      }))
    }
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
