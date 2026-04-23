import { Database } from 'sqlite';

type ColumnInfo = { name: string };

async function ensureColumn(db: Database, table: string, name: string, ddl: string): Promise<void> {
  const columns = (await db.all(`PRAGMA table_info(${table})`)) as ColumnInfo[];
  const has = columns.some((c) => c.name === name);
  if (has) return;
  await db.exec(ddl);
}

export async function up(db: Database): Promise<void> {
  await ensureColumn(
    db,
    'telegram_users',
    'crm_customer_id',
    'ALTER TABLE telegram_users ADD COLUMN crm_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL'
  );
  await ensureColumn(
    db,
    'orders',
    'telegram_chat_id',
    'ALTER TABLE orders ADD COLUMN telegram_chat_id TEXT'
  );
  await db.exec('CREATE INDEX IF NOT EXISTS idx_orders_telegram_chat_id ON orders(telegram_chat_id)');
}

export async function down(_db: Database): Promise<void> {
  console.log('ℹ️ down() skipped: SQLite column drop not applied');
}
