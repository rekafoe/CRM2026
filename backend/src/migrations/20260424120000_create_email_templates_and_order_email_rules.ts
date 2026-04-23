import { Database } from 'sqlite';

/**
 * Шаблоны писем и правила: при переходе заказа в to_status_id — письмо по шаблону.
 */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      subject_template TEXT NOT NULL,
      body_html_template TEXT NOT NULL,
      body_text_template TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS order_email_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_status_id INTEGER NOT NULL UNIQUE,
      email_template_id INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (email_template_id) REFERENCES email_templates(id) ON DELETE CASCADE
    )
  `);

  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_order_email_rules_to_status ON order_email_rules(to_status_id)`
  );

  await db.run(
    `INSERT OR IGNORE INTO email_templates (slug, name, subject_template, body_html_template, body_text_template, is_active)
     VALUES (
       'order_status_default',
       'Уведомление о статусе заказа',
       'Заказ {{orderNumber}}: {{statusName}}',
       '<p>Здравствуйте, {{customerName}}!</p><p>Заказ <strong>{{orderNumber}}</strong> — статус: <strong>{{statusName}}</strong>.</p><p>ID в CRM: {{orderId}}.</p>',
       'Здравствуйте, {{customerName}}! Заказ {{orderNumber}} — {{statusName}}. ID: {{orderId}}.',
       1
     )`
  );

  const t = await db.get<{ id: number }>(`SELECT id FROM email_templates WHERE slug = 'order_status_default'`);
  const templateId = t?.id;
  if (templateId == null) return;

  const statusRow = await db.get<{ id: number }>(
    `SELECT id FROM order_statuses WHERE name IN ('Выполнен', 'Готов', 'Передан в ПВЗ') ORDER BY id LIMIT 1`
  );
  if (!statusRow) return;

  await db.run(
    `INSERT OR IGNORE INTO order_email_rules (to_status_id, email_template_id, is_active)
     VALUES (?, ?, 0)`,
    [statusRow.id, templateId]
  );
}

export async function down(_db: Database): Promise<void> {
  // no-op
}
