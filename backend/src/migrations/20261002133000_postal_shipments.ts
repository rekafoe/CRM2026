import { Database } from 'sqlite'

/** Отправки Белпочтой и Европочтой. Доставку оплачивает наше юрлицо, не получатель. */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS postal_shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      carrier TEXT NOT NULL,
      payer TEXT NOT NULL DEFAULT 'sender_legal',
      organization_id INTEGER,
      recipient_name TEXT NOT NULL,
      recipient_phone TEXT,
      recipient_address TEXT NOT NULL,
      places INTEGER NOT NULL DEFAULT 1,
      weight_kg REAL,
      tracking_number TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_postal_shipments_order
    ON postal_shipments (order_id, id)
  `)
}

export async function down(_db: Database): Promise<void> {
  // Отправки не удаляем: по ним уже могли выписать бланки.
}
