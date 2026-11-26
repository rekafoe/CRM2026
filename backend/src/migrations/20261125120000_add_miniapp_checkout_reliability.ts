import { Database } from 'sqlite'

type ColumnInfo = { name: string }

async function ensureColumn(db: Database, name: string, ddl: string): Promise<void> {
  const columns = await db.all<ColumnInfo[]>('PRAGMA table_info(orders)')
  if (columns.some((column) => column.name === name)) return
  await db.exec(ddl)
}

export async function up(db: Database): Promise<void> {
  await ensureColumn(db, 'telegram_chat_id', 'ALTER TABLE orders ADD COLUMN telegram_chat_id TEXT')
  await ensureColumn(
    db,
    'miniapp_checkout_state',
    'ALTER TABLE orders ADD COLUMN miniapp_checkout_state TEXT',
  )
  await ensureColumn(
    db,
    'miniapp_design_help_requested',
    'ALTER TABLE orders ADD COLUMN miniapp_design_help_requested INTEGER DEFAULT 0',
  )
  await db.run(
    `UPDATE orders SET miniapp_checkout_state = 'finalized'
     WHERE miniapp_checkout_state IS NULL OR trim(miniapp_checkout_state) = ''`,
  )
  await db.run(
    'UPDATE orders SET miniapp_design_help_requested = 0 WHERE miniapp_design_help_requested IS NULL',
  )
  await ensureColumn(
    db,
    'miniapp_idempotency_key',
    'ALTER TABLE orders ADD COLUMN miniapp_idempotency_key TEXT',
  )
  await ensureColumn(
    db,
    'miniapp_request_hash',
    'ALTER TABLE orders ADD COLUMN miniapp_request_hash TEXT',
  )
  await ensureColumn(
    db,
    'miniapp_expired_at',
    'ALTER TABLE orders ADD COLUMN miniapp_expired_at TEXT',
  )
  await db.exec('CREATE INDEX IF NOT EXISTS idx_orders_telegram_chat_id ON orders(telegram_chat_id)')
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_orders_miniapp_checkout_state ON orders(miniapp_checkout_state)',
  )
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_orders_tg_chat_checkout_state ON orders(telegram_chat_id, miniapp_checkout_state)',
  )
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_miniapp_idempotency
    ON orders (telegram_chat_id, miniapp_idempotency_key)
    WHERE miniapp_idempotency_key IS NOT NULL
  `)
}

export async function down(_db: Database): Promise<void> {
  console.log('down() skipped: SQLite column drop not applied')
}
