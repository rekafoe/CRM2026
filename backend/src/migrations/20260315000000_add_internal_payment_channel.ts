import { Database } from 'sqlite';

/**
 * «Внутренние работы» — не в кассе, не в ЗП.
 * Используем колонку is_internal (без пересоздания таблицы).
 *
 * Восстановление: старая миграция делала RENAME orders TO orders_old, из‑за чего
 * items получил FK REFERENCES orders_old. Если orders_old потом удалили — items
 * ссылается на несуществующую таблицу. Нужно пересоздать items с FK на orders.
 */
export async function up(db: Database): Promise<void> {
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

  // Исправление битых FK: items может ссылаться на orders_old (после RENAME + DROP)
  const fkList = (await db.all(`PRAGMA foreign_key_list(items)`)) as Array<{ table?: string }>;
  const refsOrdersOld = (fkList || []).some((fk) => fk.table === 'orders_old');
  if (refsOrdersOld) {
    await db.exec('PRAGMA foreign_keys = OFF');
    const itemsInfo = (await db.all(`PRAGMA table_info(items)`)) as Array<{ name: string; type: string; notnull?: number; dflt_value?: string; pk?: number }>;
    const cols = itemsInfo.map((c) => `"${c.name}" ${c.type} ${c.notnull ? 'NOT NULL' : ''} ${c.dflt_value != null ? `DEFAULT ${c.dflt_value}` : ''} ${c.pk ? 'PRIMARY KEY' : ''}`).filter(Boolean).join(', ');
    await db.exec(`CREATE TABLE items_new (${cols}, FOREIGN KEY(orderId) REFERENCES orders(id) ON DELETE CASCADE)`);
    await db.exec('INSERT INTO items_new SELECT * FROM items');
    await db.exec('DROP TABLE items');
    await db.exec('ALTER TABLE items_new RENAME TO items');
    await db.exec('PRAGMA foreign_keys = ON');
  }

  const ordersExistsNow = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders'`);
  if (!ordersExistsNow) return;

  const cols = (await db.all(`PRAGMA table_info('orders')`)) as Array<{ name: string }>;
  const hasIsInternal = (cols || []).some((c) => c.name === 'is_internal');
  if (!hasIsInternal) {
    await db.exec('ALTER TABLE orders ADD COLUMN is_internal INTEGER DEFAULT 0');
  }
}

export async function down(db: Database): Promise<void> {
  // SQLite не поддерживает DROP COLUMN
}
