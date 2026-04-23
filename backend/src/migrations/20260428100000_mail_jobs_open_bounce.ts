import { Database } from 'sqlite'

/**
 * Трекинг открытия маркетинга, отметка bounce (вручную/будущий webhook).
 */
export async function up(db: Database): Promise<void> {
  const cols = (await db.all("PRAGMA table_info('mail_jobs')")) as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'open_token')) {
    await db.run('ALTER TABLE mail_jobs ADD COLUMN open_token TEXT')
  }
  if (!cols.some((c) => c.name === 'first_opened_at')) {
    await db.run('ALTER TABLE mail_jobs ADD COLUMN first_opened_at TEXT')
  }
  if (!cols.some((c) => c.name === 'bounce_noted_at')) {
    await db.run('ALTER TABLE mail_jobs ADD COLUMN bounce_noted_at TEXT')
  }
  await db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_jobs_open_token
    ON mail_jobs(open_token)
    WHERE open_token IS NOT NULL AND trim(open_token) != ''
  `)
}

export async function down(_db: Database): Promise<void> {
  // no-op
}
