import { getDb } from '../config/database'

let syncChain: Promise<void> = Promise.resolve()

type TemplateRow = {
  id: number
  department_id: number | null
  category_id: number
  amount: number
  currency: string
  expense_date: string
  title: string | null
  notes: string | null
  created_by: number | null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function chargeDate(year: number, month: number, day: number): string {
  const clamped = Math.min(Math.max(1, day), daysInMonth(year, month))
  return `${year}-${pad(month)}-${pad(clamped)}`
}

function addMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

async function tableReady(db: Awaited<ReturnType<typeof getDb>>): Promise<boolean> {
  const expenses = await db.get(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'expenses'`)
  if (!expenses) return false
  const skips = await db.get(
    `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'expense_recurring_skips'`,
  )
  if (!skips) return false
  const cols = (await db.all(`PRAGMA table_info(expenses)`)) as Array<{ name: string }>
  return cols.some((col) => col.name === 'recurring_monthly')
}

async function doSync(asOf = todayIso()): Promise<void> {
  const db = await getDb()
  if (!(await tableReady(db))) return

  const templates = (await db.all(
    `SELECT id, department_id, category_id, amount, currency, expense_date, title, notes, created_by
       FROM expenses
      WHERE COALESCE(recurring_monthly, 0) = 1
        AND recurring_source_id IS NULL`,
  )) as TemplateRow[]

  for (const template of templates || []) {
    const start = String(template.expense_date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue
    const day = Number(start.slice(8, 10))
    let year = Number(start.slice(0, 4))
    let month = Number(start.slice(5, 7))
    const cursor = addMonth(year, month)
    year = cursor.year
    month = cursor.month

    let guard = 0
    while (guard < 600) {
      guard += 1
      const date = chargeDate(year, month, day)
      if (date > asOf) break
      const yearMonth = date.slice(0, 7)
      const skipped = await db.get(
        `SELECT 1 AS ok FROM expense_recurring_skips WHERE source_id = ? AND year_month = ?`,
        [template.id, yearMonth],
      )
      const existing = await db.get(
        `SELECT id FROM expenses
          WHERE recurring_source_id = ?
            AND substr(expense_date, 1, 7) = ?`,
        [template.id, yearMonth],
      )
      if (!skipped && !existing) {
        await db.run(
          `INSERT INTO expenses
             (department_id, category_id, amount, currency, expense_date, title, notes,
              created_by, recurring_monthly, recurring_source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`,
          [
            template.department_id,
            template.category_id,
            template.amount,
            template.currency || 'BYN',
            date,
            template.title,
            template.notes,
            template.created_by,
            template.id,
          ],
        )
      }
      const next = addMonth(year, month)
      year = next.year
      month = next.month
    }
  }
}

/** Создаёт копии ежемесячных расходов по календарным месяцам до сегодня. */
export function syncRecurringExpenses(asOf?: string): Promise<void> {
  const run = syncChain.then(() => doSync(asOf))
  syncChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export async function skipRecurringMonth(sourceId: number, yearMonth: string): Promise<void> {
  const db = await getDb()
  await db.run(
    `INSERT OR IGNORE INTO expense_recurring_skips (source_id, year_month) VALUES (?, ?)`,
    [sourceId, yearMonth],
  )
}
