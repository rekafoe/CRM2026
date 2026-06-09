import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`
    ALTER TABLE design_fonts ADD COLUMN name_aliases TEXT NOT NULL DEFAULT '[]';
  `)
}

export async function down(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE design_fonts__bak AS SELECT
      id, family_name, label, filename, format, weight, style, sort_order, is_active, created_at, updated_at
    FROM design_fonts;
    DROP TABLE design_fonts;
    CREATE TABLE design_fonts (
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
    INSERT INTO design_fonts SELECT * FROM design_fonts__bak;
    DROP TABLE design_fonts__bak;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_design_fonts_family ON design_fonts(family_name);
    CREATE INDEX IF NOT EXISTS idx_design_fonts_active ON design_fonts(is_active, sort_order);
  `)
}
