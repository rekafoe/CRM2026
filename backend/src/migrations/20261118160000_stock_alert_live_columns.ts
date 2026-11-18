import { Database } from 'sqlite'

async function addColumnIfMissing(db: Database, table: string, columnDefinition: string): Promise<void> {
  const colName = columnDefinition.split(/\s+/)[0]
  const columns = await db.all<Array<{ name: string }>>(`PRAGMA table_info('${table}')`)
  if (columns.some((column) => column.name === colName)) return
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`)
}

/**
 * Одна строка алерта хранит живой остаток: имя, единицу, склад и уровень.
 * Старые колонки stock_alerts не трогаем.
 */
export async function up(db: Database): Promise<void> {
  const table = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stock_alerts'`,
  )
  if (!table) return

  const columns = [
    'material_name TEXT',
    'current_quantity REAL',
    'min_stock_level REAL',
    'min_quantity REAL',
    'supplier_name TEXT',
    'supplier_contact TEXT',
    'category_name TEXT',
    'alert_level TEXT',
    'unit TEXT',
    'warehouse_label TEXT',
  ]
  for (const column of columns) {
    await addColumnIfMissing(db, 'stock_alerts', column)
  }
}

export async function down(_db: Database): Promise<void> {
  // SQLite не снимает колонки без пересоздания таблицы.
}
