import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS design_template_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES design_templates(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT,
      mime TEXT,
      size INTEGER,
      width INTEGER,
      height INTEGER,
      thumb_filename TEXT,
      upload_status TEXT DEFAULT 'ready',
      upload_error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_design_template_assets_template
    ON design_template_assets(template_id)
  `)
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_design_template_assets_template')
  await db.exec('DROP TABLE IF EXISTS design_template_assets')
}
