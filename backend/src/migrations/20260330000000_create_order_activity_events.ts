import { Database } from 'sqlite';

/**
 * Унифицированный журнал действий по заказу (назначения, заметки и пр.).
 */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS order_activity_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT,
      old_value TEXT,
      new_value TEXT,
      comment TEXT,
      user_id INTEGER,
      meta_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_activity_events_order_id
    ON order_activity_events(order_id)
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_activity_events_created_at
    ON order_activity_events(created_at)
  `);
}

export async function down(_db: Database): Promise<void> {
  // no-op (SQLite drop table intentionally omitted)
}
