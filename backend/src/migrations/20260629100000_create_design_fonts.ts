import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS design_fonts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_name TEXT NOT NULL COLLATE NOCASE,
      label TEXT NOT NULL,
      filename TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'woff2',
      weight TEXT NOT NULL DEFAULT 'normal',
      style TEXT NOT NULL DEFAULT 'normal',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)
  await db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_design_fonts_family ON design_fonts(family_name)',
  )
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_design_fonts_active ON design_fonts(is_active, sort_order)',
  )
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_design_fonts_active')
  await db.exec('DROP INDEX IF EXISTS idx_design_fonts_family')
  await db.exec('DROP TABLE IF EXISTS design_fonts')
}
