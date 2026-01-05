import { Database } from 'sqlite'

type ColumnInfo = { name: string }

async function ensureColumn(db: Database, table: string, name: string, ddl: string): Promise<void> {
  const columns = (await db.all(`PRAGMA table_info(${table})`)) as ColumnInfo[]
  const has = columns.some((c) => c.name === name)
  if (has) return
  await db.exec(ddl)
  console.log(`✅ Added missing column ${table}.${name}`)
}

export async function up(db: Database) {
  // Печатные поля для items (нужны мапперу itemRowSelect)
  await ensureColumn(db, 'items', 'printerId', 'ALTER TABLE items ADD COLUMN printerId INTEGER')
  await ensureColumn(db, 'items', 'sides', 'ALTER TABLE items ADD COLUMN sides INTEGER DEFAULT 1')
  await ensureColumn(db, 'items', 'sheets', 'ALTER TABLE items ADD COLUMN sheets INTEGER DEFAULT 0')
  await ensureColumn(db, 'items', 'waste', 'ALTER TABLE items ADD COLUMN waste INTEGER DEFAULT 0')
  await ensureColumn(db, 'items', 'clicks', 'ALTER TABLE items ADD COLUMN clicks INTEGER DEFAULT 0')
}

export async function down(db: Database) {
  // SQLite не поддерживает DROP COLUMN без пересоздания таблицы — откат пропускаем
  console.log('ℹ️ down() skipped for 20260105030000_add_item_print_fields (SQLite DROP COLUMN not supported)')
}


