import { Database } from 'sqlite';

export async function up(db: Database): Promise<void> {
  const cols = (await db.all('PRAGMA table_info(mail_jobs)')) as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'context_order_id')) {
    await db.exec('ALTER TABLE mail_jobs ADD COLUMN context_order_id INTEGER');
  }
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_mail_jobs_context_order ON mail_jobs(context_order_id)'
  );
}

export async function down(_db: Database): Promise<void> {
  // SQLite: не дропаем колонку
}
