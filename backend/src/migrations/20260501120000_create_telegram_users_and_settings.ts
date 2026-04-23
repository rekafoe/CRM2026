import { Database } from 'sqlite'

/**
 * Таблицы для Telegram-бота: пользователи (chat_id, настройки уведомлений) и key/value настройки.
 * Ранее в коде использовались запросы без миграции — на новых БД получали SQLITE_ERROR: no such table.
 */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT,
      description TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL UNIQUE,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      role TEXT NOT NULL DEFAULT 'user',
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      notification_preferences TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await db.exec('CREATE INDEX IF NOT EXISTS idx_telegram_users_chat_id ON telegram_users (chat_id)')
}

export async function down(_db: Database): Promise<void> {
  // no-op: откат таблиц с данными не делаем
}
