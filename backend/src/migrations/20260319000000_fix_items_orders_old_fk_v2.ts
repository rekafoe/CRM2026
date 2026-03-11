import { Database } from 'sqlite';

/**
 * Повторная попытка исправления битых FK items -> orders_old.
 * Если 20260318 уже была применена до исправления — эта миграция выполнит фикс.
 */
export async function up(db: Database): Promise<void> {
  const ordersExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders'`);
  if (!ordersExists) return;

  const schemaRow = await db.get<{ sql?: string }>(`SELECT sql FROM sqlite_master WHERE type='table' AND name='items'`);
  const sql = schemaRow?.sql || '';
  if (!sql.includes('orders_old')) return;

  await db.exec('PRAGMA foreign_keys = OFF');

  const fixedSql = sql
    .replace(/\borders_old\b/gi, 'orders')
    .replace(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?"?items"?\s*\(/i, 'CREATE TABLE items_new (');
  await db.exec('DROP TABLE IF EXISTS items_new');
  await db.exec(fixedSql);
  await db.exec('INSERT INTO items_new SELECT * FROM items');
  await db.exec('DROP TABLE items');
  await db.exec('ALTER TABLE items_new RENAME TO items');
  await db.exec('PRAGMA foreign_keys = ON');
}

export async function down(db: Database): Promise<void> {}
