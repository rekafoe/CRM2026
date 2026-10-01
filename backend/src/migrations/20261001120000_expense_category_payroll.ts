import { Database } from 'sqlite'

/** Категория для автоматической записи начисленной ЗП в расходы. */
export async function up(db: Database): Promise<void> {
  const existing = await db.get<{ id: number }>(
    `SELECT id FROM expense_categories WHERE name = ? LIMIT 1`,
    ['Зарплата'],
  )
  if (!existing) {
    await db.run(
      `INSERT INTO expense_categories (name, kind, sort_order, is_active, created_at)
       VALUES ('Зарплата', 'opex', 8, 1, datetime('now'))`,
    )
  }

  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_payroll_auto
    ON expenses (expense_date, IFNULL(department_id, -1), notes)
    WHERE notes = 'payroll-auto'
  `)
}

export async function down(_db: Database): Promise<void> {
  // Категорию не удаляем: на неё могут ссылаться расходы.
}
