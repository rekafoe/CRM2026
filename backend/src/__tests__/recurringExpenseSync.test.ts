import 'dotenv/config'
import { initDB, getDb } from '../config/database'
import { ExpenseService } from '../modules/expenses/expenseService'
import { syncRecurringExpenses } from '../services/recurringExpenseSync'

describe('syncRecurringExpenses', () => {
  let categoryId: number

  beforeAll(async () => {
    await initDB()
    const categories = await ExpenseService.listCategories(false)
    const first = categories[0]
    if (!first) throw new Error('Нет категорий расходов после миграции')
    categoryId = first.id
  })

  afterEach(async () => {
    const db = await getDb()
    const rows = (await db.all(
      `SELECT id FROM expenses WHERE title LIKE 'TEST-RECUR-%'`,
    )) as Array<{ id: number }>
    for (const row of rows || []) {
      await db.run(`DELETE FROM expense_recurring_skips WHERE source_id = ?`, [row.id])
    }
    await db.run(`DELETE FROM expenses WHERE title LIKE 'TEST-RECUR-%'`)
  })

  it('charges the same amount on the template day of each later month', async () => {
    const created = await ExpenseService.create({
      category_id: categoryId,
      amount: 1000,
      expense_date: '2026-01-15',
      title: 'TEST-RECUR-rent',
      recurring_monthly: true,
    })

    expect(Number(created.recurring_monthly)).toBe(1)
    expect(created.recurring_source_id ?? null).toBeNull()

    await syncRecurringExpenses('2026-03-20')

    const db = await getDb()
    const rows = (await db.all(
      `SELECT id, expense_date, amount, recurring_monthly, recurring_source_id
         FROM expenses
        WHERE title = 'TEST-RECUR-rent'
        ORDER BY expense_date`,
    )) as Array<{
      id: number
      expense_date: string
      amount: number
      recurring_monthly: number
      recurring_source_id: number | null
    }>

    expect(rows.map((row) => String(row.expense_date).slice(0, 10))).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ])
    expect(rows[1].recurring_source_id).toBe(created.id)
    expect(Number(rows[1].recurring_monthly)).toBe(0)
    expect(rows[1].amount).toBe(1000)
    expect(rows[2].amount).toBe(1000)

    await ExpenseService.update(created.id, { amount: 1200 })
    await syncRecurringExpenses('2026-04-20')

    const afterAmount = (await db.all(
      `SELECT expense_date, amount
         FROM expenses
        WHERE title = 'TEST-RECUR-rent'
        ORDER BY expense_date`,
    )) as Array<{ expense_date: string; amount: number }>

    const byDate = new Map(afterAmount.map((row) => [String(row.expense_date).slice(0, 10), row.amount]))
    expect(byDate.get('2026-01-15')).toBe(1200)
    expect(byDate.get('2026-02-15')).toBe(1000)
    expect(byDate.get('2026-03-15')).toBe(1000)
    expect(byDate.get('2026-04-15')).toBe(1200)

    const march = rows.find((row) => String(row.expense_date).slice(0, 10) === '2026-03-15')
    if (!march) throw new Error('Нет мартовского списания')
    await ExpenseService.delete(march.id)
    await syncRecurringExpenses('2026-04-20')

    const marchLeft = await db.get(
      `SELECT id FROM expenses
        WHERE title = 'TEST-RECUR-rent' AND substr(expense_date, 1, 7) = '2026-03'`,
    )
    expect(marchLeft ?? null).toBeNull()
    const skip = await db.get(
      `SELECT 1 AS ok FROM expense_recurring_skips WHERE source_id = ? AND year_month = '2026-03'`,
      [created.id],
    )
    expect(skip).toBeDefined()
  })

  it('clamps the charge day to the length of the month', async () => {
    await ExpenseService.create({
      category_id: categoryId,
      amount: 500,
      expense_date: '2026-01-31',
      title: 'TEST-RECUR-clamp',
      recurring_monthly: true,
    })

    await syncRecurringExpenses('2026-03-31')

    const db = await getDb()
    const rows = (await db.all(
      `SELECT expense_date FROM expenses WHERE title = 'TEST-RECUR-clamp' ORDER BY expense_date`,
    )) as Array<{ expense_date: string }>

    expect(rows.map((row) => String(row.expense_date).slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ])
  })
})
