import { Database } from 'sqlite';

/**
 * Исправление FK items -> orders_old через PRAGMA foreign_key_list.
 * sqlite_master.sql может быть NULL (если таблица создана через CREATE TABLE AS),
 * поэтому проверяем FK через foreign_key_list.
 */
export async function up(db: Database): Promise<void> {
  const ordersExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders'`);
  if (!ordersExists) return;

  const itemsExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='items'`);
  if (!itemsExists) return;

  let fkList: Array<{ table?: string }> = [];
  try {
    fkList = (await db.all(`PRAGMA foreign_key_list(items)`)) as Array<{ table?: string }>;
  } catch {
    return;
  }

  const refsOrdersOld = (fkList || []).some((fk) => fk.table === 'orders_old');
  if (!refsOrdersOld) return;

  await db.exec('PRAGMA foreign_keys = OFF');

  // Вариант 1: схема из sqlite_master (если есть)
  const schemaRow = await db.get<{ sql?: string }>(`SELECT sql FROM sqlite_master WHERE type='table' AND name='items'`);
  const sql = schemaRow?.sql || '';

  if (sql && sql.includes('orders_old')) {
    const fixedSql = sql
      .replace(/\borders_old\b/gi, 'orders')
      .replace(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?"?items"?\s*\(/i, 'CREATE TABLE items_new (');
    await db.exec('DROP TABLE IF EXISTS items_new');
    await db.exec(fixedSql);
    await db.exec('INSERT INTO items_new SELECT * FROM items');
    await db.exec('DROP TABLE items');
    await db.exec('ALTER TABLE items_new RENAME TO items');
  } else {
    // Вариант 2: собираем из PRAGMA table_info (если sql пустой)
    const itemsInfo = (await db.all(`PRAGMA table_info(items)`)) as Array<{
      name: string;
      type: string;
      notnull?: number;
      dflt_value?: string | null;
      pk?: number;
    }>;
    const cols = itemsInfo
      .map((c) => {
        let def = `"${c.name}" ${c.type}`;
        if (c.notnull) def += ' NOT NULL';
        if (c.dflt_value != null && c.dflt_value !== '') def += ` DEFAULT ${c.dflt_value}`;
        if (c.pk) def += ' PRIMARY KEY';
        return def;
      })
      .join(', ');
    await db.exec('DROP TABLE IF EXISTS items_new');
    await db.exec(`CREATE TABLE items_new (${cols}, FOREIGN KEY(orderId) REFERENCES orders(id) ON DELETE CASCADE)`);
    await db.exec('INSERT INTO items_new SELECT * FROM items');
    await db.exec('DROP TABLE items');
    await db.exec('ALTER TABLE items_new RENAME TO items');
  }

  await db.exec('PRAGMA foreign_keys = ON');

  // Восстанавливаем индексы (DROP TABLE их удаляет)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_items_type ON items(type)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_items_order_type ON items(orderId, type)`);
}

export async function down(db: Database): Promise<void> {}
