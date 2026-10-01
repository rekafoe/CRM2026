import 'dotenv/config'
import { initDB, getDb } from '../config/database'
import { ExpenseService } from '../modules/expenses/expenseService'
import { PAYROLL_EXPENSE_NOTE, syncPayrollExpenses } from '../services/payrollExpenseSync'

describe('syncPayrollExpenses', () => {
  const day = '2026-09-15'

  beforeAll(async () => {
    await initDB()
  })

  afterEach(async () => {
    const db = await getDb()
    await db.run(`DELETE FROM expenses WHERE notes = ? OR title LIKE 'TEST-PAYROLL-%'`, [PAYROLL_EXPENSE_NOTE])
    await db.run(`DELETE FROM user_shifts WHERE comment = 'TEST-PAYROLL'`)
    await db.run(`DELETE FROM user_bonuses WHERE reason = 'TEST-PAYROLL'`)
    await db.run(`DELETE FROM users WHERE email = 'test-payroll@example.com'`)
  })

  it('writes net salary into expenses for the user department', async () => {
    const db = await getDb()
    const user = await db.run(
      `INSERT INTO users (name, email, role, department_id, hourly_rate)
       VALUES ('Тест ЗП', 'test-payroll@example.com', 'user', NULL, 10)`,
    )
    const userId = Number(user.lastID)
    await db.run(
      `INSERT INTO user_shifts (user_id, work_date, hours, comment) VALUES (?, ?, 4, 'TEST-PAYROLL')`,
      [userId, day],
    )
    await db.run(
      `INSERT INTO user_bonuses (user_id, amount, reason, bonus_date) VALUES (?, 15, 'TEST-PAYROLL', ?)`,
      [userId, day],
    )

    await syncPayrollExpenses(day, day)

    const summary = await ExpenseService.getSummary({ date_from: day, date_to: day })
    expect(summary.total).toBeGreaterThanOrEqual(55)
    expect(summary.company_wide).toBeGreaterThanOrEqual(55)

    const rows = await ExpenseService.list({ date_from: day, date_to: day })
    const payroll = rows.filter((row) => row.notes === PAYROLL_EXPENSE_NOTE && row.expense_date.slice(0, 10) === day)
    expect(payroll).toHaveLength(1)
    expect(payroll[0].title).toBe('Зарплата')
    expect(payroll[0].category_name).toBe('Зарплата')
    expect(payroll[0].amount).toBe(55)
    expect(payroll[0].department_id).toBeNull()
  })
})
