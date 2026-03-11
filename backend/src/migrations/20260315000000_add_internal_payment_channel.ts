import { Database } from 'sqlite';

/**
 * «Внутренние работы» — не в кассе, не в ЗП.
 * Используем колонку is_internal (без пересоздания таблицы).
 */
export async function up(db: Database): Promise<void> {
  // Восстановление после частично проваленной миграции
  const ordersExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders'`);
  const ordersNewExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders_new'`);
  const ordersOldExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders_old'`);

  if (!ordersExists && ordersNewExists) {
    await db.exec('ALTER TABLE orders_new RENAME TO orders');
    await db.exec('PRAGMA foreign_keys = ON');
  }
  if (!ordersExists && ordersOldExists) {
    await db.exec('ALTER TABLE orders_old RENAME TO orders');
  }

  const ordersExistsNow = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders'`);
  if (!ordersExistsNow) return;

  const hasIsInternal = await db.get<{ name: string }>(
    `SELECT name FROM pragma_table_info('orders') WHERE name = 'is_internal'`
  );
  if (!hasIsInternal) {
    await db.exec('ALTER TABLE orders ADD COLUMN is_internal INTEGER DEFAULT 0');
  }
}

export async function down(db: Database): Promise<void> {
  // SQLite не поддерживает DROP COLUMN
}
