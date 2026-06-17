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
    'site_preview_url',
    'ALTER TABLE design_templates ADD COLUMN site_preview_url TEXT',
  )
}

export async function down(_db: Database): Promise<void> {
  console.log('ℹ️ down() skipped: SQLite does not support DROP COLUMN easily')
}
