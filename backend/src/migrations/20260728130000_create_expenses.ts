import { Database } from 'sqlite'

function nowSql(): string {
  return "datetime('now')"
}

const SEED_CATEGORIES: Array<{ name: string; kind: 'opex' | 'cogs' | 'other'; sort_order: number }> = [
  { name: 'Аренда', kind: 'opex', sort_order: 1 },
  { name: 'Коммуналка', kind: 'opex', sort_order: 2 },
  { name: 'Реклама', kind: 'opex', sort_order: 3 },
  { name: 'Закупка (вне склада)', kind: 'opex', sort_order: 4 },
  { name: 'Налоги', kind: 'opex', sort_order: 5 },
  { name: 'Транспорт', kind: 'opex', sort_order: 6 },
  { name: 'Прочее', kind: 'opex', sort_order: 7 },
]

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK(kind IN ('opex','cogs','other')) DEFAULT 'opex',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (${nowSql()})
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      category_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      currency TEXT NOT NULL DEFAULT 'BYN',
      expense_date TEXT NOT NULL,
      title TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (${nowSql()}),
      updated_at TEXT NOT NULL DEFAULT (${nowSql()}),
      FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE RESTRICT
    )
  `)

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses (expense_date)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_department_id ON expenses (department_id)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses (category_id)`)

  for (const cat of SEED_CATEGORIES) {
    const existing = await db.get<{ id: number }>(
      `SELECT id FROM expense_categories WHERE name = ? LIMIT 1`,
      [cat.name]
    )
    if (!existing) {
      await db.run(
        `INSERT INTO expense_categories (name, kind, sort_order, is_active, created_at)
         VALUES (?, ?, ?, 1, ${nowSql()})`,
        [cat.name, cat.kind, cat.sort_order]
      )
    }
  }
}

export async function down(_db: Database): Promise<void> {
  // SQLite: таблицы не удаляем
}
