import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'

/** Маркер строк, которые CRM сама пишет из начисленной ЗП. Ручные расходы не трогаем. */
export const PAYROLL_EXPENSE_NOTE = 'payroll-auto'
export const PAYROLL_EXPENSE_TITLE = 'Зарплата'
export const PAYROLL_CATEGORY_NAME = 'Зарплата'

type DeptAmount = { date: string; departmentId: number | null; amount: number }

let syncChain: Promise<void> = Promise.resolve()

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function deptKey(departmentId: number | null): string {
  return departmentId == null ? 'null' : String(departmentId)
}

function rowKey(date: string, departmentId: number | null): string {
  return `${date}|${deptKey(departmentId)}`
}

async function tableExists(db: Awaited<ReturnType<typeof getDb>>, name: string): Promise<boolean> {
  const row = await db.get(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`, name)
  return !!row
}

async function ensurePayrollCategory(db: Awaited<ReturnType<typeof getDb>>): Promise<number | null> {
  if (!(await tableExists(db, 'expense_categories')) || !(await tableExists(db, 'expenses'))) {
    return null
  }
  const existing = await db.get<{ id: number }>(
    `SELECT id FROM expense_categories WHERE name = ? LIMIT 1`,
    [PAYROLL_CATEGORY_NAME],
  )
  if (existing?.id) return Number(existing.id)
  const inserted = await db.run(
    `INSERT INTO expense_categories (name, kind, sort_order, is_active, created_at)
     VALUES (?, 'opex', 8, 1, datetime('now'))`,
    [PAYROLL_CATEGORY_NAME],
  )
  return Number(inserted.lastID)
}

async function ensurePayrollIndex(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_payroll_auto
    ON expenses (expense_date, IFNULL(department_id, -1), notes)
    WHERE notes = 'payroll-auto'
  `)
}

function addAmount(
  totals: Map<string, DeptAmount>,
  date: string,
  departmentId: number | null,
  amount: number,
): void {
  const day = String(date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return
  const delta = Number(amount) || 0
  if (!delta) return
  const key = rowKey(day, departmentId)
  const current = totals.get(key)
  if (current) {
    current.amount += delta
    return
  }
  totals.set(key, { date: day, departmentId, amount: delta })
}

async function loadComponent(
  db: Awaited<ReturnType<typeof getDb>>,
  totals: Map<string, DeptAmount>,
  sql: string,
  params: string[],
  sign: 1 | -1,
): Promise<void> {
  const rows = (await db.all(sql, params)) as Array<{
    d: string
    department_id: number | null
    amt: number
  }>
  for (const row of rows || []) {
    const dept = row.department_id == null ? null : Number(row.department_id)
    addAmount(totals, row.d, Number.isFinite(dept as number) ? dept : null, sign * Number(row.amt || 0))
  }
}

async function doSync(dateFrom?: string, dateTo?: string): Promise<void> {
  const db = await getDb()
  const categoryId = await ensurePayrollCategory(db)
  if (!categoryId) return
  await ensurePayrollIndex(db)

  const from = dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : null
  const to = dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : null
  const dateClause = (column: string) => {
    const parts: string[] = []
    const params: string[] = []
    if (from) {
      parts.push(`substr(${column}, 1, 10) >= ?`)
      params.push(from)
    }
    if (to) {
      parts.push(`substr(${column}, 1, 10) <= ?`)
      params.push(to)
    }
    return {
      where: parts.length ? parts.join(' AND ') : '1 = 1',
      params,
    }
  }

  const totals = new Map<string, DeptAmount>()
  const hasUserDept = await hasColumn('users', 'department_id')
  const deptExpr = hasUserDept ? 'u.department_id' : 'NULL'

  if (await tableExists(db, 'order_item_earnings')) {
    const filter = dateClause('e.earned_date')
    await loadComponent(
      db,
      totals,
      `SELECT substr(e.earned_date, 1, 10) AS d, ${deptExpr} AS department_id, SUM(e.amount) AS amt
         FROM order_item_earnings e
         LEFT JOIN users u ON u.id = e.user_id
        WHERE ${filter.where}
        GROUP BY substr(e.earned_date, 1, 10), ${deptExpr}`,
      filter.params,
      1,
    )
  }

  if (await tableExists(db, 'user_bonuses')) {
    const filter = dateClause('b.bonus_date')
    await loadComponent(
      db,
      totals,
      `SELECT substr(b.bonus_date, 1, 10) AS d, ${deptExpr} AS department_id, SUM(b.amount) AS amt
         FROM user_bonuses b
         LEFT JOIN users u ON u.id = b.user_id
        WHERE ${filter.where}
        GROUP BY substr(b.bonus_date, 1, 10), ${deptExpr}`,
      filter.params,
      1,
    )
  }

  if (await tableExists(db, 'user_penalties')) {
    const filter = dateClause('p.penalty_date')
    await loadComponent(
      db,
      totals,
      `SELECT substr(p.penalty_date, 1, 10) AS d, ${deptExpr} AS department_id, SUM(p.amount) AS amt
         FROM user_penalties p
         LEFT JOIN users u ON u.id = p.user_id
        WHERE ${filter.where}
        GROUP BY substr(p.penalty_date, 1, 10), ${deptExpr}`,
      filter.params,
      -1,
    )
  }

  if ((await tableExists(db, 'user_shifts')) && (await hasColumn('users', 'hourly_rate'))) {
    const filter = dateClause('s.work_date')
    await loadComponent(
      db,
      totals,
      `SELECT substr(s.work_date, 1, 10) AS d, ${deptExpr} AS department_id,
              SUM(COALESCE(s.hours, 0) * COALESCE(u.hourly_rate, 0)) AS amt
         FROM user_shifts s
         JOIN users u ON u.id = s.user_id
        WHERE ${filter.where}
        GROUP BY substr(s.work_date, 1, 10), ${deptExpr}`,
      filter.params,
      1,
    )
  }

  const wanted = new Map<string, DeptAmount>()
  for (const [key, row] of totals) {
    const amount = roundMoney(row.amount)
    if (amount >= 0.01) wanted.set(key, { ...row, amount })
  }

  const existingFilter = dateClause('expense_date')
  const existing = (await db.all(
    `SELECT id, substr(expense_date, 1, 10) AS d, department_id, amount
       FROM expenses
      WHERE notes = ? AND ${existingFilter.where}`,
    [PAYROLL_EXPENSE_NOTE, ...existingFilter.params],
  )) as Array<{ id: number; d: string; department_id: number | null; amount: number }>

  const existingByKey = new Map<string, { id: number; amount: number }>()
  for (const row of existing || []) {
    const dept = row.department_id == null ? null : Number(row.department_id)
    existingByKey.set(rowKey(row.d, dept), { id: Number(row.id), amount: Number(row.amount) || 0 })
  }

  await db.exec('BEGIN')
  try {
    for (const [key, row] of wanted) {
      const current = existingByKey.get(key)
      if (!current) {
        await db.run(
          `INSERT INTO expenses
             (department_id, category_id, amount, currency, expense_date, title, notes, created_at, updated_at)
           VALUES (?, ?, ?, 'BYN', ?, ?, ?, datetime('now'), datetime('now'))`,
          [row.departmentId, categoryId, row.amount, row.date, PAYROLL_EXPENSE_TITLE, PAYROLL_EXPENSE_NOTE],
        )
        continue
      }
      if (roundMoney(current.amount) !== row.amount) {
        await db.run(
          `UPDATE expenses
              SET amount = ?, category_id = ?, title = ?, updated_at = datetime('now')
            WHERE id = ? AND notes = ?`,
          [row.amount, categoryId, PAYROLL_EXPENSE_TITLE, current.id, PAYROLL_EXPENSE_NOTE],
        )
      }
    }

    for (const [key, current] of existingByKey) {
      if (!wanted.has(key)) {
        await db.run(`DELETE FROM expenses WHERE id = ? AND notes = ?`, [current.id, PAYROLL_EXPENSE_NOTE])
      }
    }
    await db.exec('COMMIT')
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }
}

/** Перезаписывает авторасходы «Зарплата» из процентов, ставки, премий и штрафов. */
export function syncPayrollExpenses(dateFrom?: string, dateTo?: string): Promise<void> {
  const run = syncChain.then(() => doSync(dateFrom, dateTo))
  syncChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
