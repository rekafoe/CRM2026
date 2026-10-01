import { Database } from 'sqlite'

async function addColumnIfMissing(db: Database, table: string, column: string, definition: string): Promise<void> {
  const cols = (await db.all(`PRAGMA table_info(${table})`)) as Array<{ name: string }>
  if (cols.some((col) => col.name === column)) return
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

/** Ежемесячный шаблон расхода и пропуски уже удалённых месяцев. */
export async function up(db: Database): Promise<void> {
  await addColumnIfMissing(db, 'expenses', 'recurring_monthly', 'INTEGER NOT NULL DEFAULT 0')
  await addColumnIfMissing(db, 'expenses', 'recurring_source_id', 'INTEGER REFERENCES expenses(id) ON DELETE SET NULL')
  await db.exec(`
    CREATE TABLE IF NOT EXISTS expense_recurring_skips (
      source_id INTEGER NOT NULL,
      year_month TEXT NOT NULL,
      PRIMARY KEY (source_id, year_month)
    )
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_expenses_recurring_source
    ON expenses (recurring_source_id)
  `)
}

export async function down(_db: Database): Promise<void> {
  // Колонки SQLite не снимаем.
}
