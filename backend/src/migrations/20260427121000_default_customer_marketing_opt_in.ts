import { randomBytes } from 'crypto'
import { Database } from 'sqlite'

/**
 * CRM-клиенты по умолчанию доступны для рассылок.
 * Отказ фиксируется в карточке клиента или через ссылку отписки.
 */
export async function up(db: Database): Promise<void> {
  const cols = (await db.all("PRAGMA table_info('customers')")) as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'marketing_opt_in')) {
    await db.run('ALTER TABLE customers ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 1')
  }
  if (!cols.some((c) => c.name === 'email_unsubscribed_at')) {
    await db.run('ALTER TABLE customers ADD COLUMN email_unsubscribed_at TEXT')
  }
  if (!cols.some((c) => c.name === 'unsubscribe_token')) {
    await db.run('ALTER TABLE customers ADD COLUMN unsubscribe_token TEXT')
  }

  await db.run(`
    UPDATE customers
    SET marketing_opt_in = 1
    WHERE email_unsubscribed_at IS NULL
      AND (marketing_opt_in IS NULL OR marketing_opt_in = 0)
  `)

  const rows = (await db.all(
    'SELECT id FROM customers WHERE unsubscribe_token IS NULL OR trim(unsubscribe_token) = ""'
  )) as Array<{ id: number }>
  for (const row of rows) {
    await db.run('UPDATE customers SET unsubscribe_token = ? WHERE id = ?', [
      randomBytes(24).toString('hex'),
      row.id,
    ])
  }

  await db.run(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unsubscribe_token ON customers(unsubscribe_token) WHERE unsubscribe_token IS NOT NULL AND trim(unsubscribe_token) != ""'
  )
}

export async function down(_db: Database): Promise<void> {
  // SQLite: откат массового согласия и колонок не выполняем.
}
