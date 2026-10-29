import { Database } from 'sqlite'

/** Необязательный менеджер юрлица: ведёт клиента и подписывает акты, счета и договоры. */
export async function up(db: Database): Promise<void> {
  const columns = (await db.all("PRAGMA table_info('customers')")) as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'manager_user_id')) {
    await db.run(
      'ALTER TABLE customers ADD COLUMN manager_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
    )
  }
  await db.run(
    'CREATE INDEX IF NOT EXISTS idx_customers_manager_user_id ON customers(manager_user_id)',
  )
}

export async function down(db: Database): Promise<void> {
  try {
    await db.run('DROP INDEX IF EXISTS idx_customers_manager_user_id')
    await db.run('ALTER TABLE customers DROP COLUMN manager_user_id')
  } catch {
    // SQLite без DROP COLUMN оставляет поле.
  }
}
