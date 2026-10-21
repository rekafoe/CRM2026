import { Database } from 'sqlite'

/**
 * Чаты поддержки с сайта: диалог, иммутабельные сообщения, события и скрипты ответа.
 * Канал website — первый живой канал общей воронки.
 */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS support_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      channel TEXT NOT NULL DEFAULT 'website',
      website_user_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      customer_phone TEXT,
      topic TEXT NOT NULL,
      subject TEXT,
      order_ref TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_user_id INTEGER,
      last_message_at TEXT NOT NULL,
      last_message_preview TEXT,
      customer_unread INTEGER NOT NULL DEFAULT 0,
      operator_unread INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT,
      FOREIGN KEY(assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_support_conversations_user
      ON support_conversations(website_user_id, last_message_at DESC);
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_support_conversations_queue
      ON support_conversations(channel, status, assigned_user_id, last_message_at DESC);
  `)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      operator_user_id INTEGER,
      operator_name TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(operator_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_support_messages_conversation
      ON support_messages(conversation_id, id);
  `)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS support_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      actor_user_id INTEGER,
      payload TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS support_reply_scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const existing = await db.get<{ c: number }>('SELECT COUNT(1) as c FROM support_reply_scripts')
  if (Number(existing?.c || 0) === 0) {
    const scripts: Array<[string, string, number]> = [
      ['Качество', '{имя}, по заказу {заказ} передали тираж в перепечатку. Напишем, когда будет готово.', 1],
      ['Доставка', '{имя}, заказ {заказ} передан на повторную доставку. Напишем, когда курьер будет на адресе.', 2],
      ['Макет', '{имя}, для печати нужны вылеты 3 мм. Пришлите обновлённый файл по заказу {заказ}.', 3],
      ['Свой', '', 4],
    ]
    for (const [title, body, sortOrder] of scripts) {
      await db.run(
        'INSERT INTO support_reply_scripts (title, body, sort_order) VALUES (?, ?, ?)',
        title,
        body,
        sortOrder,
      )
    }
  }
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP TABLE IF EXISTS support_events')
  await db.exec('DROP TABLE IF EXISTS support_messages')
  await db.exec('DROP TABLE IF EXISTS support_conversations')
  await db.exec('DROP TABLE IF EXISTS support_reply_scripts')
}
