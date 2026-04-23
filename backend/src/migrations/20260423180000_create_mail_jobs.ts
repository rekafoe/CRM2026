import { Database } from 'sqlite';

/**
 * Очередь исходящей почты (транзакционные и маркетинговые письма).
 */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mail_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL DEFAULT 'transactional',
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT,
      body_text TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      idempotency_key TEXT UNIQUE,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_attempt_at TEXT,
      last_error TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_jobs_status_next
    ON mail_jobs(status, next_attempt_at, id)
  `);
}

export async function down(_db: Database): Promise<void> {
  // no-op
}
