import { Database } from 'sqlite';

/**
 * Безусловное пересоздание items с FK на orders.
 * Всегда пересоздаёт items — гарантированно убирает orders_old.
 */
export async function up(db: Database): Promise<void> {
  const ordersExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders'`);
  const itemsExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='items'`);
  if (!ordersExists || !itemsExists) return;

  await db.exec('PRAGMA foreign_keys = OFF');

  const cols = (await db.all(`PRAGMA table_info(items)`)) as Array<{
    name: string;
    type: string;
    notnull?: number;
    dflt_value?: string | null;
    pk?: number;
  }>;
  const colDefs = cols
    .map((c) => {
      let def = `"${c.name}" ${c.type}`;
      if (c.notnull) def += ' NOT NULL';
      if (c.dflt_value != null && c.dflt_value !== '') def += ` DEFAULT ${c.dflt_value}`;
      if (c.pk) def += ' PRIMARY KEY';
      return def;
    })
    .join(', ');

  await db.exec('DROP TABLE IF EXISTS items_new');
  await db.exec(`CREATE TABLE items_new (${colDefs}, FOREIGN KEY(orderId) REFERENCES orders(id) ON DELETE CASCADE)`);
  await db.exec('INSERT INTO items_new SELECT * FROM items');
  await db.exec('DROP TABLE items');
  await db.exec('ALTER TABLE items_new RENAME TO items');

  await db.exec('PRAGMA foreign_keys = ON');
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_items_type ON items(type)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_items_order_type ON items(orderId, type)`);
}

export async function down(db: Database): Promise<void> {}
