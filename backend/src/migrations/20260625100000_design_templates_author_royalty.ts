import { Database } from 'sqlite'

type ColumnInfo = { name: string }

async function ensureColumn(db: Database, table: string, name: string, ddl: string): Promise<void> {
  const columns = (await db.all(`PRAGMA table_info(${table})`)) as ColumnInfo[]
  if (columns.some((c) => c.name === name)) return
  await db.exec(ddl)
}

export async function up(db: Database): Promise<void> {
  await ensureColumn(
    db,
    'design_templates',
    'author_user_id',
    'ALTER TABLE design_templates ADD COLUMN author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
  )
  await ensureColumn(
    db,
    'design_templates',
    'usage_fee',
    'ALTER TABLE design_templates ADD COLUMN usage_fee REAL NOT NULL DEFAULT 0',
  )
  await ensureColumn(
    db,
    'design_templates',
    'author_percent',
    'ALTER TABLE design_templates ADD COLUMN author_percent REAL NOT NULL DEFAULT 0',
  )
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_design_templates_author_user_id ON design_templates(author_user_id)',
  )
}

export async function down(_db: Database): Promise<void> {
  console.log('ℹ️ down() skipped: SQLite does not support DROP COLUMN easily')
}
