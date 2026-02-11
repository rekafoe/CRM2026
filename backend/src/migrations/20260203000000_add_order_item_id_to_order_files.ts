/**
 * Привязка файлов макетов к позициям заказа (order items).
 * orderItemId = NULL — файл без привязки (общие макеты).
 */

type ColumnInfo = { name: string }

async function ensureColumn(db: any, table: string, name: string, ddl: string): Promise<void> {
  const columns = (await db.all(`PRAGMA table_info(${table})`)) as ColumnInfo[]
  const has = columns.some((c) => c.name === name)
  if (has) return
  await db.exec(ddl)
  console.log(`✅ Added ${table}.${name}`)
}

export async function up(db: any): Promise<void> {
  await ensureColumn(
    db,
    'order_files',
    'orderItemId',
    'ALTER TABLE order_files ADD COLUMN orderItemId INTEGER REFERENCES items(id) ON DELETE SET NULL'
  )
}

export async function down(_db: any): Promise<void> {
  console.log('ℹ️ down() skipped: SQLite does not support DROP COLUMN easily')
}
