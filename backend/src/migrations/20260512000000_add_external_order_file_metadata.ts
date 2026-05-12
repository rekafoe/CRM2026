/**
 * Метаданные внешних файлов заказа.
 * Нужны для S3/object storage flow: сайт загружает тяжелые JPG/PDF в свое хранилище,
 * а CRM регистрирует ссылку/ключ без приема гигабайтного multipart.
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
  await ensureColumn(db, 'order_files', 'storage', "ALTER TABLE order_files ADD COLUMN storage TEXT NOT NULL DEFAULT 'local'")
  await ensureColumn(db, 'order_files', 'externalProvider', 'ALTER TABLE order_files ADD COLUMN externalProvider TEXT')
  await ensureColumn(db, 'order_files', 'externalBucket', 'ALTER TABLE order_files ADD COLUMN externalBucket TEXT')
  await ensureColumn(db, 'order_files', 'externalKey', 'ALTER TABLE order_files ADD COLUMN externalKey TEXT')
  await ensureColumn(db, 'order_files', 'externalUrl', 'ALTER TABLE order_files ADD COLUMN externalUrl TEXT')
  await ensureColumn(db, 'order_files', 'externalStatus', "ALTER TABLE order_files ADD COLUMN externalStatus TEXT NOT NULL DEFAULT 'ready'")
  await ensureColumn(db, 'order_files', 'artifactType', 'ALTER TABLE order_files ADD COLUMN artifactType TEXT')
  await ensureColumn(db, 'order_files', 'checksum', 'ALTER TABLE order_files ADD COLUMN checksum TEXT')
  await ensureColumn(db, 'order_files', 'partNumber', 'ALTER TABLE order_files ADD COLUMN partNumber INTEGER')
  await ensureColumn(db, 'order_files', 'metadata', 'ALTER TABLE order_files ADD COLUMN metadata TEXT')
}

export async function down(_db: any): Promise<void> {
  console.log('ℹ️ down() skipped: SQLite does not support DROP COLUMN easily')
}
