import { Database } from 'sqlite'

function nowSql(): string {
  return "datetime('now')"
}

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL CHECK(channel IN ('email','sms','telegram')),
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      subject_template TEXT,
      body_template TEXT NOT NULL,
      body_html_template TEXT,
      variables_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (${nowSql()}),
      updated_at TEXT NOT NULL DEFAULT (${nowSql()})
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      channel_scope TEXT NOT NULL CHECK(channel_scope IN ('all','email','sms','telegram')),
      filters_json TEXT NOT NULL DEFAULT '{}',
      estimated_count_cache INTEGER,
      created_at TEXT NOT NULL DEFAULT (${nowSql()}),
      updated_at TEXT NOT NULL DEFAULT (${nowSql()})
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      channel TEXT NOT NULL CHECK(channel IN ('email','sms','telegram')),
      kind TEXT NOT NULL CHECK(kind IN ('marketing','transactional_manual')) DEFAULT 'marketing',
      status TEXT NOT NULL CHECK(status IN ('draft','scheduled','running','paused','completed','failed','cancelled')) DEFAULT 'draft',
      template_id INTEGER NOT NULL,
      segment_id INTEGER NOT NULL,
      created_by INTEGER,
      scheduled_at TEXT,
      settings_json TEXT,
      created_at TEXT NOT NULL DEFAULT (${nowSql()}),
      updated_at TEXT NOT NULL DEFAULT (${nowSql()}),
      FOREIGN KEY (template_id) REFERENCES campaign_templates(id) ON DELETE RESTRICT,
      FOREIGN KEY (segment_id) REFERENCES campaign_segments(id) ON DELETE RESTRICT,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('test','live')),
      status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled')) DEFAULT 'queued',
      started_at TEXT,
      finished_at TEXT,
      stats_json TEXT,
      error_text TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (${nowSql()}),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_run_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      customer_id INTEGER,
      telegram_user_id INTEGER,
      destination TEXT NOT NULL,
      payload_json TEXT,
      delivery_status TEXT NOT NULL CHECK(delivery_status IN ('queued','sent','delivered','opened','failed','skipped','unsubscribed','cancelled')) DEFAULT 'queued',
      provider_message_id TEXT,
      mail_job_id INTEGER,
      sms_log_id INTEGER,
      opened_at TEXT,
      clicked_at TEXT,
      error_text TEXT,
      created_at TEXT NOT NULL DEFAULT (${nowSql()}),
      updated_at TEXT NOT NULL DEFAULT (${nowSql()}),
      FOREIGN KEY (run_id) REFERENCES campaign_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (telegram_user_id) REFERENCES telegram_users(id) ON DELETE SET NULL,
      FOREIGN KEY (mail_job_id) REFERENCES mail_jobs(id) ON DELETE SET NULL
    )
  `)

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_campaign_templates_channel ON campaign_templates(channel)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_campaign_segments_scope ON campaign_segments(channel_scope)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_campaigns_status_sched ON campaigns(status, scheduled_at)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_campaign_runs_campaign ON campaign_runs(campaign_id, created_at)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_campaign_run_recipients_run ON campaign_run_recipients(run_id, delivery_status)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_campaign_run_recipients_mail_job ON campaign_run_recipients(mail_job_id)`)

  await db.run(
    `INSERT OR IGNORE INTO campaign_templates
      (channel, slug, name, subject_template, body_template, body_html_template, variables_json, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      'email',
      'campaign_email_default',
      'Email: базовый шаблон кампании',
      '{{subject}}',
      'Здравствуйте, {{customerName}}!',
      '<p>Здравствуйте, {{customerName}}!</p><p>{{message}}</p><p><a href=\"{{unsubscribeUrl}}\">Отписаться</a></p>',
      JSON.stringify(['subject', 'message', 'customerName', 'unsubscribeUrl']),
    ]
  )

  await db.run(
    `INSERT OR IGNORE INTO campaign_templates
      (channel, slug, name, subject_template, body_template, body_html_template, variables_json, is_active)
     VALUES (?, ?, ?, NULL, ?, NULL, ?, 1)`,
    [
      'sms',
      'campaign_sms_default',
      'SMS: базовый шаблон кампании',
      '{{message}}',
      JSON.stringify(['message', 'customerName']),
    ]
  )

  await db.run(
    `INSERT OR IGNORE INTO campaign_templates
      (channel, slug, name, subject_template, body_template, body_html_template, variables_json, is_active)
     VALUES (?, ?, ?, NULL, ?, NULL, ?, 1)`,
    [
      'telegram',
      'campaign_telegram_default',
      'Telegram: базовый шаблон кампании',
      '{{message}}',
      JSON.stringify(['message', 'customerName']),
    ]
  )

  await db.run(
    `INSERT OR IGNORE INTO campaign_segments (id, name, channel_scope, filters_json, estimated_count_cache)
     VALUES (1, 'Email: подписчики с согласием', 'email', ?, NULL)`,
    [JSON.stringify({ requireMarketingOptIn: true, hasEmail: true, customerType: 'any' })]
  )
  await db.run(
    `INSERT OR IGNORE INTO campaign_segments (id, name, channel_scope, filters_json, estimated_count_cache)
     VALUES (2, 'SMS: клиенты с телефоном', 'sms', ?, NULL)`,
    [JSON.stringify({ hasPhone: true, customerType: 'any' })]
  )
  await db.run(
    `INSERT OR IGNORE INTO campaign_segments (id, name, channel_scope, filters_json, estimated_count_cache)
     VALUES (3, 'Telegram: активные пользователи бота', 'telegram', ?, NULL)`,
    [JSON.stringify({ includeInactiveTelegramUsers: false })]
  )
}

export async function down(_db: Database): Promise<void> {
  // no-op
}
