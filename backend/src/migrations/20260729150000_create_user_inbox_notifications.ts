import { Database } from 'sqlite'

/**
 * In-app уведомления для пользователей CRM (колокольчик в топбаре).
 */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_inbox_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      payload TEXT,
      actor_user_id INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      read_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_inbox_notifications_user_unread
      ON user_inbox_notifications(user_id, is_read, id DESC);
  `)
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_user_inbox_notifications_user_unread')
  await db.exec('DROP TABLE IF EXISTS user_inbox_notifications')
}
