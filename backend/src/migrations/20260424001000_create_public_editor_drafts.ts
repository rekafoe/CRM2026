import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS editor_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      design_template_id INTEGER REFERENCES design_templates(id) ON DELETE SET NULL,
      product_id INTEGER,
      type_id INTEGER,
      size_id TEXT,
      mode TEXT NOT NULL DEFAULT 'single',
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS editor_draft_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_id INTEGER NOT NULL REFERENCES editor_drafts(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      originalName TEXT,
      mime TEXT,
      size INTEGER,
      uploadedAt TEXT DEFAULT (datetime('now'))
    )
  `)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_editor_drafts_token ON editor_drafts(token)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_editor_draft_files_draft ON editor_draft_files(draft_id)`)
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_editor_draft_files_draft')
  await db.exec('DROP INDEX IF EXISTS idx_editor_drafts_token')
  await db.exec('DROP TABLE IF EXISTS editor_draft_files')
  await db.exec('DROP TABLE IF EXISTS editor_drafts')
}
