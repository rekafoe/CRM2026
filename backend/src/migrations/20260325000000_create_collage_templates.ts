import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS collage_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      photo_count INTEGER NOT NULL,
      layout TEXT NOT NULL,
      padding_default INTEGER DEFAULT 20,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_collage_templates_photo_count ON collage_templates(photo_count)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_collage_templates_is_active ON collage_templates(is_active)`)
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_collage_templates_is_active')
  await db.exec('DROP INDEX IF EXISTS idx_collage_templates_photo_count')
  await db.exec('DROP TABLE IF EXISTS collage_templates')
}
