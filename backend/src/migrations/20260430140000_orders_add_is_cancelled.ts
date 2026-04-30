import { Database } from 'sqlite'

/**
 * Флаг мягкой отмены заказа (пул, CRM/сайт/TG/Mini App).
 * Без колонки перманентное удаление и фильтры по отменённым недоступны.
 */
export async function up(db: Database): Promise<void> {
  const cols = (await db.all(`PRAGMA table_info('orders')`)) as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'is_cancelled')) {
    await db.exec(`ALTER TABLE orders ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0`)
  }
}

export async function down(_db: Database): Promise<void> {
  // SQLite: DROP COLUMN ограничен
}
