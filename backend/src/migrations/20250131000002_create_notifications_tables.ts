import { Database } from 'sqlite';

export async function up(db: Database) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      channels TEXT NOT NULL, -- comma-separated list: email,sms,telegram
      subject TEXT,
      body TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_key TEXT,
      channel TEXT NOT NULL, -- email|sms|telegram|push
      to_address TEXT,
      payload TEXT NOT NULL, -- JSON
      status TEXT NOT NULL DEFAULT 'queued', -- queued|sent|failed
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT
    );
  `);

  await db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_channel ON notifications(channel);`);

  // seed base template for auto-order email
  await db.run(`
    INSERT OR IGNORE INTO notification_templates (key, channels, subject, body, is_active)
    VALUES (
      'auto_order.request',
      'email',
      'Автозаказ материала: {material_name}',
      'Добрый день!\n\nСоздан автозаказ материала {material_name}.\nКоличество: {quantity}\nПоставщик: {supplier_name}\nПричина: {reason}\n\nДата: {date} {time}',
      1
    );
  `);

  console.log('Migration create_notifications_tables applied');
}

export async function down(db: Database) {
  await db.run('DROP TABLE IF EXISTS notifications;');
  await db.run('DROP TABLE IF EXISTS notification_templates;');
  console.log('Migration create_notifications_tables reverted');
}


