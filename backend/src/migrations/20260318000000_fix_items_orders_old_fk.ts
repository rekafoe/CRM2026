import { Database } from 'sqlite';

/**
 * Исправление битых FK: таблица items может ссылаться на несуществующую orders_old
 * (после прерванной миграции с RENAME orders TO orders_old).
 * При INSERT в items SQLite проверяет FK и падает с "no such table: main.orders_old".
 *
 * Миграция идемпотентна: проверяет PRAGMA foreign_key_list(items) и пересоздаёт items
 * только если FK ссылается на orders_old.
 */
export async function up(db: Database): Promise<void> {
  const ordersExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders'`);
  if (!ordersExists) return;

  const fkList = (await db.all(`PRAGMA foreign_key_list(items)`)) as Array<{ table?: string }>;
  const refsOrdersOld = (fkList || []).some(
    (fk) => (fk.table || (fk as any).table) === 'orders_old'
  );
  if (!refsOrdersOld) return;

  await db.exec('PRAGMA foreign_keys = OFF');

  const itemsInfo = (await db.all(`PRAGMA table_info(items)`)) as Array<{
    name: string;
    type: string;
    notnull?: number;
    dflt_value?: string | null;
    pk?: number;
  }>;
  const cols = itemsInfo
    .map(
      (c) =>
        `"${c.name}" ${c.type} ${c.notnull ? 'NOT NULL' : ''} ${c.dflt_value != null ? `DEFAULT ${c.dflt_value}` : ''} ${c.pk ? 'PRIMARY KEY' : ''}`
    )
    .filter(Boolean)
    .join(', ');
  await db.exec(
    `CREATE TABLE items_new (${cols}, FOREIGN KEY(orderId) REFERENCES orders(id) ON DELETE CASCADE)`
  );
  await db.exec('INSERT INTO items_new SELECT * FROM items');
  await db.exec('DROP TABLE items');
  await db.exec('ALTER TABLE items_new RENAME TO items');
  await db.exec('PRAGMA foreign_keys = ON');
}

export async function down(db: Database): Promise<void> {
  // Forward-only fix, no rollback
}
