import { Database } from 'sqlite'

/**
 * SMS: шаблоны, правила по статусу, дебаунс автоотправки (один pending на заказ), лог.
 */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sms_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      body_template TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS order_sms_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_status_id INTEGER NOT NULL UNIQUE,
      sms_template_id INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sms_template_id) REFERENCES sms_templates(id) ON DELETE CASCADE
    )
  `)

  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_order_sms_rules_to_status ON order_sms_rules(to_status_id)'
  )

  await db.exec(`
    CREATE TABLE IF NOT EXISTS sms_debounce (
      order_id INTEGER PRIMARY KEY,
      target_status_id INTEGER NOT NULL,
      send_after TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS sms_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      phone TEXT NOT NULL,
      body TEXT NOT NULL,
      channel TEXT NOT NULL,
      target_status_id INTEGER,
      idempotency_key TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  await db.exec('CREATE INDEX IF NOT EXISTS idx_sms_log_order ON sms_log(order_id)')
  await db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_log_idem ON sms_log(idempotency_key) WHERE idempotency_key IS NOT NULL AND length(trim(idempotency_key)) > 0'
  )

  await db.run(
    `INSERT OR IGNORE INTO sms_templates (slug, name, body_template, is_active)
     VALUES (
       'order_status_default_sms',
       'Статус заказа (SMS)',
       'Заказ {{orderNumber}}: {{statusName}}. ID {{orderId}}',
       1
     )`
  )
  const t = await db.get<{ id: number }>(
    "SELECT id FROM sms_templates WHERE slug = 'order_status_default_sms'"
  )
  if (t?.id != null) {
    const statusRow = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE name IN ('Выполнен', 'Готов', 'Передан в ПВЗ') ORDER BY id LIMIT 1`
    )
    if (statusRow) {
      await db.run(
        `INSERT OR IGNORE INTO order_sms_rules (to_status_id, sms_template_id, is_active)
         VALUES (?, ?, 0)`,
        [statusRow.id, t.id]
      )
    }
  }
}

export async function down(_db: Database): Promise<void> {
  // no-op
}
