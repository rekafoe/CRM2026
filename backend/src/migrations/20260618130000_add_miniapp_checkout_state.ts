import { Database } from 'sqlite';

type ColumnInfo = { name: string };

async function ensureColumn(db: Database, table: string, name: string, ddl: string): Promise<void> {
  const columns = (await db.all(`PRAGMA table_info(${table})`)) as ColumnInfo[];
  if (columns.some((c) => c.name === name)) return;
  await db.exec(ddl);
}

export async function up(db: Database): Promise<void> {
  await ensureColumn(
    db,
    'orders',
    'miniapp_checkout_state',
    `ALTER TABLE orders ADD COLUMN miniapp_checkout_state TEXT`
  );
  await ensureColumn(
    db,
    'orders',
    'miniapp_design_help_requested',
    `ALTER TABLE orders ADD COLUMN miniapp_design_help_requested INTEGER DEFAULT 0`
  );

  await db.run(
    `UPDATE orders
     SET miniapp_checkout_state = 'finalized'
     WHERE miniapp_checkout_state IS NULL OR trim(miniapp_checkout_state) = ''`
  );
  await db.run(
    `UPDATE orders
     SET miniapp_design_help_requested = 0
     WHERE miniapp_design_help_requested IS NULL`
  );

  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_orders_miniapp_checkout_state ON orders(miniapp_checkout_state)'
  );
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_orders_tg_chat_checkout_state ON orders(telegram_chat_id, miniapp_checkout_state)'
  );
}

export async function down(_db: Database): Promise<void> {
  console.log('ℹ️ down() skipped: SQLite column drop not applied');
}

