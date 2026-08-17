import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS design_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'clipart',
      filename TEXT NOT NULL,
      mime TEXT,
      format TEXT NOT NULL DEFAULT 'svg',
      width INTEGER,
      height INTEGER,
      thumb_filename TEXT,
      category TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_design_assets_active_kind ON design_assets(is_active, kind, sort_order)',
  )
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_design_assets_active_kind')
  await db.exec('DROP TABLE IF EXISTS design_assets')
}
