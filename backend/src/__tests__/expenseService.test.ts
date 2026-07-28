import 'dotenv/config'
import { initDB, getDb } from '../config/database'
import { ExpenseService } from '../modules/expenses/expenseService'

describe('ExpenseService', () => {
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
    await db.run(`DELETE FROM expenses WHERE title LIKE 'TEST-EXPENSE-%'`)
  })

  it('creates and lists an expense', async () => {
    const expenseDate = '2026-07-15'
    const created = await ExpenseService.create({
      category_id: categoryId,
      amount: 150.5,
      expense_date: expenseDate,
      title: 'TEST-EXPENSE-create',
      notes: 'unit test',
    })

    expect(created.id).toBeTruthy()
    expect(created.amount).toBe(150.5)
    expect(created.category_id).toBe(categoryId)

    const list = await ExpenseService.list({
      date_from: expenseDate,
      date_to: expenseDate,
    })
    const found = list.find((e) => e.id === created.id)
    expect(found).toBeDefined()
    expect(found?.title).toBe('TEST-EXPENSE-create')
  })

  it('returns summary with total and company_wide', async () => {
    const expenseDate = '2026-07-20'
    await ExpenseService.create({
      category_id: categoryId,
      amount: 200,
      expense_date: expenseDate,
      title: 'TEST-EXPENSE-summary-company',
      department_id: null,
    })
    await ExpenseService.create({
      category_id: categoryId,
      amount: 50,
      expense_date: expenseDate,
      title: 'TEST-EXPENSE-summary-dept',
      department_id: null,
    })

    const summary = await ExpenseService.getSummary({
      date_from: expenseDate,
      date_to: expenseDate,
    })

    expect(summary.total).toBeGreaterThanOrEqual(250)
    expect(summary.company_wide).toBeGreaterThanOrEqual(250)
    expect(Array.isArray(summary.by_department)).toBe(true)
  })

  it('rejects amount <= 0', async () => {
    await expect(
      ExpenseService.create({
        category_id: categoryId,
        amount: 0,
        expense_date: '2026-07-10',
        title: 'TEST-EXPENSE-invalid',
      })
    ).rejects.toThrow('Сумма расхода должна быть больше 0')

    await expect(
      ExpenseService.create({
        category_id: categoryId,
        amount: -10,
        expense_date: '2026-07-10',
        title: 'TEST-EXPENSE-invalid-neg',
      })
    ).rejects.toThrow('Сумма расхода должна быть больше 0')
  })
})
