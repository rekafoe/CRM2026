import { Database } from 'sqlite';

/**
 * Почасовая ставка сотрудника (BYN/час).
 * В ЗП: hours из user_shifts × hourly_rate + проценты + премии − штрафы.
 */
export async function up(db: Database): Promise<void> {
  const cols = (await db.all('PRAGMA table_info(users)')) as Array<{ name: string }>;
  const names = new Set((Array.isArray(cols) ? cols : []).map((c) => c.name));
  if (!names.has('hourly_rate')) {
    await db.exec(`ALTER TABLE users ADD COLUMN hourly_rate REAL NOT NULL DEFAULT 0`);
  }
}
