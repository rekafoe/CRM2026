import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'
import { revenueOrdersCondition } from '../utils/orderFulfillmentScope'
import { turnoverTaxAmount } from '../utils/turnoverTax'

/** Маркер авторасхода. Ручные налоги с другими notes не трогаем. */
export const TURNOVER_TAX_NOTE_PREFIX = 'tax-auto:'
export const TURNOVER_TAX_CATEGORY_NAME = 'Налоги'

let syncChain: Promise<void> = Promise.resolve()

type Quarter = { key: string; start: string; end: string }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function quarterEndDay(year: number, quarter: number): string {
  const month = quarter * 3
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${pad(month)}-${pad(last)}`
}

function quarterOfIso(iso: string): Quarter {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const quarter = Math.floor((month - 1) / 3) + 1
  const startMonth = (quarter - 1) * 3 + 1
  return {
    key: `${year}-Q${quarter}`,
    start: `${year}-${pad(startMonth)}-01`,
    end: quarterEndDay(year, quarter),
  }
}

function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function quartersOverlapping(from: string | null, to: string | null): Quarter[] {
  const start = from ?? '2000-01-01'
  const end = to ?? '2999-12-31'
  const first = quarterOfIso(start)
  const last = quarterOfIso(end)
  const out: Quarter[] = []
  let year = Number(first.key.slice(0, 4))
  let quarter = Number(first.key.slice(-1))
  const lastYear = Number(last.key.slice(0, 4))
  const lastQuarter = Number(last.key.slice(-1))
  while (year < lastYear || (year === lastYear && quarter <= lastQuarter)) {
    out.push(quarterOfIso(`${year}-${pad((quarter - 1) * 3 + 1)}-01`))
    quarter += 1
    if (quarter > 4) {
      quarter = 1
      year += 1
    }
  }
  return out
}

async function tableExists(db: Awaited<ReturnType<typeof getDb>>, name: string): Promise<boolean> {
  const row = await db.get(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`, name)
  return !!row
}

async function ensureTaxCategory(db: Awaited<ReturnType<typeof getDb>>): Promise<number | null> {
  if (!(await tableExists(db, 'expense_categories')) || !(await tableExists(db, 'expenses'))) return null
  const existing = await db.get<{ id: number }>(
    `SELECT id FROM expense_categories WHERE name = ? LIMIT 1`,
    [TURNOVER_TAX_CATEGORY_NAME],
  )
  if (existing?.id) return Number(existing.id)
  const inserted = await db.run(
    `INSERT INTO expense_categories (name, kind, sort_order, is_active, created_at)
     VALUES (?, 'opex', 5, 1, datetime('now'))`,
    [TURNOVER_TAX_CATEGORY_NAME],
  )
  return Number(inserted.lastID)
}

async function quarterRevenue(
  db: Awaited<ReturnType<typeof getDb>>,
  start: string,
  end: string,
): Promise<number> {
  const hasIsCancelled = await hasColumn('orders', 'is_cancelled')
  const notCancelled = hasIsCancelled
    ? 'AND o.status != 0 AND COALESCE(o.is_cancelled, 0) = 0'
    : 'AND o.status != 0'
  const row = await db.get<{ revenue: number }>(
    `SELECT COALESCE(SUM(
        (1 - COALESCE(o.discount_percent, 0) / 100.0) * COALESCE(i_totals.raw_total, 0)
      ), 0) AS revenue
       FROM orders o
       LEFT JOIN (
         SELECT orderId, COALESCE(SUM(
           CASE
             WHEN json_valid(params) = 1
               AND json_type(json_extract(params, '$.storedTotalCost')) IN ('integer', 'real')
             THEN CAST(json_extract(params, '$.storedTotalCost') AS REAL)
             ELSE CAST(price AS REAL) * CAST(MAX(1, COALESCE(quantity, 1)) AS REAL)
           END
         ), 0) AS raw_total
         FROM items
         GROUP BY orderId
       ) i_totals ON i_totals.orderId = o.id
      WHERE substr(COALESCE(o.createdAt, o.created_at), 1, 10) >= ?
        AND substr(COALESCE(o.createdAt, o.created_at), 1, 10) <= ?
        AND ${revenueOrdersCondition('o')}
        ${notCancelled}`,
    [start, end],
  )
  return Number(row?.revenue || 0)
}

async function doSync(dateFrom?: string, dateTo?: string): Promise<void> {
  const db = await getDb()
  const categoryId = await ensureTaxCategory(db)
  if (!categoryId) return
  if (!(await tableExists(db, 'orders'))) return

  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_tax_auto
    ON expenses (notes)
    WHERE notes LIKE 'tax-auto:%'
  `)

  const from = dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : null
  const to = dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : null
  const today = todayIso()
  const quarters = quartersOverlapping(from, to).filter((q) => q.start <= today)

  for (const quarter of quarters) {
    const revenueEnd = quarter.end < today ? quarter.end : today
    const revenue = await quarterRevenue(db, quarter.start, revenueEnd)
    const amount = turnoverTaxAmount(revenue)
    const note = `${TURNOVER_TAX_NOTE_PREFIX}${quarter.key}`
    const expenseDate = quarter.end < today ? quarter.end : today
    const title = `Налог 6% · ${quarter.key}`
    const existing = await db.get<{ id: number }>(
      `SELECT id FROM expenses WHERE notes = ? LIMIT 1`,
      [note],
    )

    if (amount < 0.01) {
      if (existing?.id) {
        await db.run(`DELETE FROM expenses WHERE id = ? AND notes = ?`, [existing.id, note])
      }
      continue
    }

    if (!existing?.id) {
      await db.run(
        `INSERT INTO expenses
           (department_id, category_id, amount, currency, expense_date, title, notes, created_at, updated_at)
         VALUES (NULL, ?, ?, 'BYN', ?, ?, ?, datetime('now'), datetime('now'))`,
        [categoryId, amount, expenseDate, title, note],
      )
      continue
    }

    await db.run(
      `UPDATE expenses
          SET amount = ?, category_id = ?, expense_date = ?, title = ?, department_id = NULL,
              updated_at = datetime('now')
        WHERE id = ? AND notes = ?`,
      [amount, categoryId, expenseDate, title, existing.id, note],
    )
  }
}

/** Пишет в расходы 6% выручки за каждый затронутый квартал. */
export function syncTurnoverTaxExpenses(dateFrom?: string, dateTo?: string): Promise<void> {
  const run = syncChain.then(() => doSync(dateFrom, dateTo))
  syncChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
