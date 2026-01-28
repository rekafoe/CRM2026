import { Database } from 'sqlite';

/**
 * События закрытия долга: сумма, закрытая в день выдачи заказа.
 * Используется для учёта в дневном отчёте «Долги закрыты в этот день».
 */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS debt_closed_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      closed_date TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_debt_closed_events_date
    ON debt_closed_events(closed_date)
  `);
}
