import { Database } from 'sqlite'

/** Согласие на рассылку с регистрации сайта, даже если карточки клиента ещё нет. */
export async function up(db: Database): Promise<void> {
  await db.run(`
    CREATE TABLE IF NOT EXISTS marketing_email_consents (
      email TEXT PRIMARY KEY,
      opted_in INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}

export async function down(db: Database): Promise<void> {
  await db.run('DROP TABLE IF EXISTS marketing_email_consents')
}
