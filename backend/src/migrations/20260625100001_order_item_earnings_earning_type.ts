import { Database } from 'sqlite'

type ColumnInfo = { name: string }

export async function up(db: Database): Promise<void> {
  const columns = (await db.all('PRAGMA table_info(order_item_earnings)')) as ColumnInfo[]
  const hasEarningType = columns.some((c) => c.name === 'earning_type')
  if (hasEarningType) return

  await db.exec(`
    CREATE TABLE order_item_earnings_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      order_item_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      order_item_total REAL NOT NULL DEFAULT 0,
      percent REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      earned_date TEXT NOT NULL,
      earning_type TEXT NOT NULL DEFAULT 'operator',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT,
      UNIQUE(order_item_id, earned_date, earning_type),
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(order_item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  await db.exec(`
    INSERT INTO order_item_earnings_new (
      id, order_id, order_item_id, user_id, order_item_total, percent, amount,
      earned_date, earning_type, created_at, updated_at
    )
    SELECT
      id, order_id, order_item_id, user_id, order_item_total, percent, amount,
      earned_date, 'operator', created_at, updated_at
    FROM order_item_earnings;
  `)

  await db.exec('DROP TABLE order_item_earnings;')
  await db.exec('ALTER TABLE order_item_earnings_new RENAME TO order_item_earnings;')

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_item_earnings_earned_date
    ON order_item_earnings(earned_date);
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_item_earnings_user_date
    ON order_item_earnings(user_id, earned_date);
  `)
}

export async function down(_db: Database): Promise<void> {
  console.log('ℹ️ down() skipped: order_item_earnings earning_type migration is not reversible')
}
