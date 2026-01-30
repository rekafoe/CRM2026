import { Database } from 'sqlite';

/**
 * Добавляем operator_percent в post_processing_services.
 * Без этой колонки процент оператора не сохраняется и не возвращается API.
 */
export async function up(db: Database): Promise<void> {
  const columns = (await db.all(`PRAGMA table_info(post_processing_services)`)) as Array<{ name: string }>;
  const hasOp = columns.some((c) => c.name === 'operator_percent');
  if (!hasOp) {
    await db.exec(`ALTER TABLE post_processing_services ADD COLUMN operator_percent REAL DEFAULT 0`);
  }
}
