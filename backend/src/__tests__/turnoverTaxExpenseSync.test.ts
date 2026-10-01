import 'dotenv/config'
import { initDB, getDb } from '../config/database'
import { ExpenseService } from '../modules/expenses/expenseService'
import { syncTurnoverTaxExpenses, TURNOVER_TAX_NOTE_PREFIX } from '../services/turnoverTaxExpenseSync'

describe('syncTurnoverTaxExpenses', () => {
  const day = '2026-08-15'

  beforeAll(async () => {
    await initDB()
  })

  afterEach(async () => {
    const db = await getDb()
    await db.run(`DELETE FROM items WHERE type LIKE 'TEST-TAX%'`)
    await db.run(`DELETE FROM orders WHERE number LIKE 'TEST-TAX%'`)
    await db.run(`DELETE FROM expenses WHERE notes LIKE 'tax-auto:%'`)
  })

  it('writes 6% of quarterly revenue into Налоги', async () => {
    const db = await getDb()
    const status = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE id != 0 ORDER BY id LIMIT 1`,
    )
    const order = await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, prepaymentAmount, prepaymentStatus, paymentMethod)
       VALUES ('TEST-TAX-1', ?, ?, ?, 1000, 'paid', 'offline')`,
      [status?.id ?? 1, `${day} 12:00:00`, `${day} 12:00:00`],
    )
    await db.run(
      `INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, 'TEST-TAX', '{}', 1000, 1)`,
      [Number(order.lastID)],
    )

    await syncTurnoverTaxExpenses('2026-07-01', '2026-09-30')

    const rows = await ExpenseService.list({ date_from: '2026-07-01', date_to: '2026-09-30' })
    const tax = rows.find((row) => row.notes === `${TURNOVER_TAX_NOTE_PREFIX}2026-Q3`)
    expect(tax).toBeDefined()
    expect(tax?.category_name).toBe('Налоги')
    expect(tax?.department_id).toBeNull()
    expect(tax?.expense_date.slice(0, 10)).toBe('2026-09-30')
    expect(tax?.amount).toBe(60)
  })

  it('keeps the full calendar quarter when the screen filter is a single month', async () => {
    const db = await getDb()
    const status = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE id != 0 ORDER BY id LIMIT 1`,
    )
    const insertOrder = async (number: string, date: string, amount: number) => {
      const order = await db.run(
        `INSERT INTO orders (number, status, createdAt, created_at, prepaymentAmount, prepaymentStatus, paymentMethod)
         VALUES (?, ?, ?, ?, ?, 'paid', 'offline')`,
        [number, status?.id ?? 1, `${date} 12:00:00`, `${date} 12:00:00`, amount],
      )
      await db.run(
        `INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, 'TEST-TAX-Q', '{}', ?, 1)`,
        [Number(order.lastID), amount],
      )
    }

    await insertOrder('TEST-TAX-JUL', '2025-07-10', 1000)
    await insertOrder('TEST-TAX-SEP', '2025-09-20', 2000)

    await syncTurnoverTaxExpenses('2025-09-01', '2025-09-30', '2025-09-25')

    const midQuarter = await db.get<{ amount: number }>(
      `SELECT amount FROM expenses WHERE notes = ?`,
      [`${TURNOVER_TAX_NOTE_PREFIX}2025-Q3`],
    )
    expect(midQuarter?.amount).toBe(180)

    await db.run(
      `UPDATE expenses SET amount = 60, expense_date = '2025-07-31' WHERE notes = ?`,
      [`${TURNOVER_TAX_NOTE_PREFIX}2025-Q3`],
    )

    await syncTurnoverTaxExpenses('2025-10-01', '2025-10-31', '2025-10-05')

    const closedQuarter = await db.get<{ amount: number; expense_date: string }>(
      `SELECT amount, expense_date FROM expenses WHERE notes = ?`,
      [`${TURNOVER_TAX_NOTE_PREFIX}2025-Q3`],
    )
    expect(closedQuarter?.amount).toBe(180)
    expect(String(closedQuarter?.expense_date).slice(0, 10)).toBe('2025-09-30')
  })
})