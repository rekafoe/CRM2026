import type { Database } from 'sqlite'
import { hasColumn } from '../utils/tableSchemaCache'
import { notWaitingStatusSql } from '../utils/orderFulfillmentScope'
import { sqlOrderTotalAfterDiscount } from '../utils/orderAmountsSql'
import {
  salesBonusPayrollDate,
  salesManagerBonusFromTurnover,
  type SalesManagerBonus,
} from './salesManagerBonus'

export type SalesManagerOrderLine = {
  orderId: number
  number: string
  customerId: number
  customerName: string
  orderDate: string
  total: number
}

export type SalesManagerOutput = SalesManagerBonus & {
  userId: number
  name: string
  departmentId: number | null
  clients: number
  orders: SalesManagerOrderLine[]
}

type RosterRow = {
  user_id: number
  name: string
  department_id: number | null
  clients: number
}

type OrderRow = {
  user_id: number
  month_key: string
  order_id: number
  number: string | null
  customer_id: number
  customer_name: string | null
  created_at: string
  total: number
}

async function tableExists(db: Database, name: string): Promise<boolean> {
  const row = await db.get(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`, name)
  return !!row
}

async function loadRoster(db: Database): Promise<RosterRow[]> {
  if (!(await tableExists(db, 'customers')) || !(await tableExists(db, 'users'))) return []
  if (!(await hasColumn('customers', 'manager_user_id'))) return []
  const hasDept = await hasColumn('users', 'department_id')
  return (await db.all(
    `SELECT c.manager_user_id AS user_id,
            u.name AS name,
            ${hasDept ? 'u.department_id' : 'NULL'} AS department_id,
            COUNT(*) AS clients
       FROM customers c
       JOIN users u ON u.id = c.manager_user_id
      WHERE c.type = 'legal' AND c.manager_user_id IS NOT NULL
      GROUP BY c.manager_user_id, u.name${hasDept ? ', u.department_id' : ''}`,
  )) as RosterRow[]
}

async function loadOrders(db: Database, months: string[] | null): Promise<OrderRow[]> {
  if (!(await tableExists(db, 'orders')) || !(await tableExists(db, 'customers'))) return []
  if (!(await hasColumn('customers', 'manager_user_id'))) return []
  if (months && months.length === 0) return []

  const hasCancelled = await hasColumn('orders', 'is_cancelled')
  const hasChannel = await hasColumn('orders', 'payment_channel')
  const hasDiscount = await hasColumn('orders', 'discount_percent')
  const totalSql = sqlOrderTotalAfterDiscount(
    'o.id',
    hasDiscount ? 'COALESCE(o.discount_percent, 0)' : '0',
  )
  const params: string[] = []
  const monthClause = months
    ? `AND substr(o.created_at, 1, 7) IN (${months.map(() => '?').join(',')})`
    : ''
  if (months) params.push(...months)

  return (await db.all(
    `SELECT c.manager_user_id AS user_id,
            substr(o.created_at, 1, 7) AS month_key,
            o.id AS order_id,
            o.number AS number,
            c.id AS customer_id,
            COALESCE(NULLIF(TRIM(c.legal_name), ''), NULLIF(TRIM(c.company_name), ''), 'Юрлицо') AS customer_name,
            o.created_at AS created_at,
            ${totalSql} AS total
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
      WHERE c.type = 'legal'
        AND c.manager_user_id IS NOT NULL
        ${hasCancelled ? 'AND COALESCE(o.is_cancelled, 0) = 0' : ''}
        AND ${notWaitingStatusSql('o.status')}
        ${hasChannel ? "AND LOWER(COALESCE(o.payment_channel, '')) != 'internal'" : ''}
        ${monthClause}`,
    params,
  )) as OrderRow[]
}

function ordersOf(rows: OrderRow[], userId: number, month: string): SalesManagerOrderLine[] {
  return rows
    .filter((row) => Number(row.user_id) === userId && row.month_key === month && Number(row.total) > 0)
    .map((row) => ({
      orderId: Number(row.order_id),
      number: row.number?.trim() || `#${row.order_id}`,
      customerId: Number(row.customer_id),
      customerName: row.customer_name?.trim() || 'Юрлицо',
      orderDate: String(row.created_at || '').slice(0, 10),
      total: Math.round((Number(row.total) + Number.EPSILON) * 100) / 100,
    }))
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.orderId - a.orderId)
}

export async function loadSalesManagerOutput(
  db: Database,
  month: string,
  options?: { departmentId?: number },
): Promise<SalesManagerOutput[]> {
  const [roster, orders] = await Promise.all([loadRoster(db), loadOrders(db, [month])])
  const departmentId = options?.departmentId
  return roster
    .filter((row) => departmentId == null || Number(row.department_id) === departmentId)
    .map((row) => {
      const lines = ordersOf(orders, Number(row.user_id), month)
      const turnover = lines.reduce((sum, line) => sum + line.total, 0)
      return {
        userId: Number(row.user_id),
        name: row.name,
        departmentId: row.department_id == null ? null : Number(row.department_id),
        clients: Number(row.clients) || 0,
        orders: lines,
        ...salesManagerBonusFromTurnover(turnover),
      }
    })
    .sort((a, b) => b.turnover - a.turnover || a.name.localeCompare(b.name, 'ru'))
}

/** Ключ userId_YYYY-MM → сумма премии. Нужен сводке зарплаты за несколько месяцев. */
export async function salesBonusAmountMap(db: Database, months: string[] | null): Promise<Map<string, number>> {
  const orders = await loadOrders(db, months)
  const turnover = new Map<string, number>()
  for (const row of orders) {
    const total = Number(row.total) || 0
    if (total <= 0 || !row.month_key) continue
    const key = `${Number(row.user_id)}_${row.month_key}`
    turnover.set(key, (turnover.get(key) || 0) + total)
  }
  const bonuses = new Map<string, number>()
  for (const [key, amount] of turnover) {
    bonuses.set(key, salesManagerBonusFromTurnover(amount).bonus)
  }
  return bonuses
}

function monthsWhoseEndFallsInRange(from?: string, to?: string): string[] | null {
  if (!from && !to) return null
  const start = (from || '2000-01-01').slice(0, 7)
  const end = (to || '2100-12-31').slice(0, 7)
  const months: string[] = []
  let year = Number(start.slice(0, 4))
  let month = Number(start.slice(5, 7))
  const endYear = Number(end.slice(0, 4))
  const endMonth = Number(end.slice(5, 7))
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(endYear) || !Number.isFinite(endMonth)) {
    return []
  }
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    const payrollDate = salesBonusPayrollDate(key)
    const afterFrom = !from || payrollDate >= from.slice(0, 10)
    const beforeTo = !to || payrollDate <= to.slice(0, 10)
    if (afterFrom && beforeTo) months.push(key)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

/** Месячная премия садится на последний день месяца и отдел менеджера. */
export async function salesBonusPayrollAmounts(
  db: Database,
  from?: string,
  to?: string,
): Promise<Array<{ date: string; departmentId: number | null; amount: number }>> {
  const months = monthsWhoseEndFallsInRange(from, to)
  if (months && months.length === 0) return []
  const [roster, bonuses] = await Promise.all([loadRoster(db), salesBonusAmountMap(db, months)])
  const deptByUser = new Map(roster.map((row) => [Number(row.user_id), row.department_id == null ? null : Number(row.department_id)]))
  const grouped = new Map<string, { date: string; departmentId: number | null; amount: number }>()
  for (const [key, bonus] of bonuses) {
    if (bonus <= 0) continue
    const split = key.lastIndexOf('_')
    const userId = Number(key.slice(0, split))
    const month = key.slice(split + 1)
    const date = salesBonusPayrollDate(month)
    if (!date) continue
    const departmentId = deptByUser.get(userId) ?? null
    const groupKey = `${date}|${departmentId == null ? 'null' : departmentId}`
    const current = grouped.get(groupKey)
    if (current) current.amount += bonus
    else grouped.set(groupKey, { date, departmentId, amount: bonus })
  }
  return Array.from(grouped.values())
}
