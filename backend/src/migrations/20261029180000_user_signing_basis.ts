import { Database } from 'sqlite'

/** Необязательное основание, на котором пользователь CRM подписывает договор, акт и счёт. */
export async function up(db: Database): Promise<void> {
  const columns = (await db.all("PRAGMA table_info('users')")) as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'signing_basis')) {
    await db.run('ALTER TABLE users ADD COLUMN signing_basis TEXT')
  }
}

export async function down(db: Database): Promise<void> {
  try {
    await db.run('ALTER TABLE users DROP COLUMN signing_basis')
  } catch {
    // SQLite без DROP COLUMN оставляет поле.
  }
}
