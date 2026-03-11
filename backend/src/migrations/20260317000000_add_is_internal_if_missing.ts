import { Database } from 'sqlite';

/**
 * Добавляет is_internal если колонки нет (на случай если 20260315 была применена старой версией).
 */
export async function up(db: Database): Promise<void> {
  const cols = (await db.all(`PRAGMA table_info('orders')`)) as Array<{ name: string }>;
  const hasIsInternal = (cols || []).some((c) => c.name === 'is_internal');
  if (!hasIsInternal) {
    await db.exec('ALTER TABLE orders ADD COLUMN is_internal INTEGER DEFAULT 0');
  }
}

export async function down(db: Database): Promise<void> {}
