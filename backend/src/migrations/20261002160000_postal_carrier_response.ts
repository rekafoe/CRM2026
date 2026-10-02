import { Database } from 'sqlite'

async function addColumnIfMissing(db: Database, table: string, column: string, definition: string): Promise<void> {
  const cols = (await db.all(`PRAGMA table_info(${table})`)) as Array<{ name: string }>
  if (cols.some((col) => col.name === column)) return
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

/** Ответ Белпочты или Европочты: их номер, их файл бланка, статус формирования. */
export async function up(db: Database): Promise<void> {
  await addColumnIfMissing(db, 'postal_shipments', 'external_id', 'TEXT')
  await addColumnIfMissing(db, 'postal_shipments', 'document_id', 'TEXT')
  await addColumnIfMissing(db, 'postal_shipments', 'blank_status', `TEXT NOT NULL DEFAULT 'none'`)
  await addColumnIfMissing(db, 'postal_shipments', 'blank_filename', 'TEXT')
  await addColumnIfMissing(db, 'postal_shipments', 'blank_content_type', 'TEXT')
  await addColumnIfMissing(db, 'postal_shipments', 'blank_file', 'BLOB')
  await addColumnIfMissing(db, 'postal_shipments', 'carrier_message', 'TEXT')
}

export async function down(_db: Database): Promise<void> {
  // Файлы перевозчика не удаляем: это их бланк, а не наш черновик.
}
