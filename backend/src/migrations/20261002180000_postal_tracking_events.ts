import { Database } from 'sqlite'

async function addColumnIfMissing(db: Database, table: string, column: string, definition: string): Promise<void> {
  const cols = (await db.all(`PRAGMA table_info(${table})`)) as Array<{ name: string }>
  if (cols.some((col) => col.name === column)) return
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

/** История статусов Белпочты и Европочты по уже созданным отправлениям. */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS postal_tracking_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL,
      event_key TEXT NOT NULL,
      event_at TEXT,
      code TEXT,
      title TEXT NOT NULL,
      place TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (shipment_id, event_key)
    )
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_postal_tracking_events_shipment
    ON postal_tracking_events (shipment_id, event_at, id)
  `)
  await addColumnIfMissing(db, 'postal_shipments', 'tracking_checked_at', 'TEXT')
  await addColumnIfMissing(db, 'postal_shipments', 'tracking_error', 'TEXT')
}

export async function down(_db: Database): Promise<void> {
  // Историю прохождения не удаляем.
}
