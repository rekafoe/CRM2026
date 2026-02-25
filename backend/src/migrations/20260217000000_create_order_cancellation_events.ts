import { Database } from 'sqlite';

/**
 * Журнал причин отмен/удалений заказов для аналитики и аудита.
 */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS order_cancellation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      order_number TEXT,
      order_source TEXT,
      status_before INTEGER,
      event_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      reason_code TEXT,
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_cancellation_events_order_id
    ON order_cancellation_events(order_id)
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_cancellation_events_created_at
    ON order_cancellation_events(created_at)
  `);
}

