import { Database } from 'sqlite'

async function addColumnIfMissing(db: Database, table: string, column: string, definition: string): Promise<void> {
  const cols = (await db.all(`PRAGMA table_info(${table})`)) as Array<{ name: string }>
  if (cols.some((col) => col.name === column)) return
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

/** Пункт выдачи Европочты: их WarehouseId, не свободный адрес. */
export async function up(db: Database): Promise<void> {
  await addColumnIfMissing(db, 'postal_shipments', 'pickup_point_id', 'TEXT')
}

export async function down(_db: Database): Promise<void> {
  // Выбранный пункт не удаляем: по нему уже могли оформить отправление.
}
