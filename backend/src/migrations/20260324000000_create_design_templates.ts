import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS design_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      preview_url TEXT,
      spec TEXT,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_design_templates_category ON design_templates(category)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_design_templates_is_active ON design_templates(is_active)`)
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_design_templates_is_active')
  await db.exec('DROP INDEX IF EXISTS idx_design_templates_category')
  await db.exec('DROP TABLE IF EXISTS design_templates')
}
