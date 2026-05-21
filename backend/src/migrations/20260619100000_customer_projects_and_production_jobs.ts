import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS customer_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      title TEXT,
      design_state_json TEXT,
      photo_batch_json TEXT,
      source_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      source_order_item_id INTEGER,
      editor_draft_token TEXT,
      design_template_id INTEGER,
      editor_mode TEXT,
      editable INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_customer_projects_customer ON customer_projects(customer_id)`)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS editor_production_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      order_item_id INTEGER NOT NULL,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_editor_production_jobs_status ON editor_production_jobs(status)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_editor_production_jobs_order ON editor_production_jobs(order_id)`)
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_editor_production_jobs_order')
  await db.exec('DROP INDEX IF EXISTS idx_editor_production_jobs_status')
  await db.exec('DROP TABLE IF EXISTS editor_production_jobs')
  await db.exec('DROP INDEX IF EXISTS idx_customer_projects_customer')
  await db.exec('DROP TABLE IF EXISTS customer_projects')
}
