import { Database } from 'sqlite';

/**
 * Штрафы сотрудников: учитываются при расчёте ЗП (total_earnings - total_penalties = к выплате).
 */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_penalties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      penalty_date TEXT NOT NULL,
      order_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      created_by INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_penalties_user_date
    ON user_penalties(user_id, penalty_date);
  `);
}
