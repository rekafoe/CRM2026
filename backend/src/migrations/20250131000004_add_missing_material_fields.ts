import { Database } from 'sqlite'

const COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'min_stock_level', ddl: 'ALTER TABLE materials ADD COLUMN min_stock_level REAL DEFAULT 0' },
  { name: 'location', ddl: 'ALTER TABLE materials ADD COLUMN location TEXT' },
  { name: 'barcode', ddl: 'ALTER TABLE materials ADD COLUMN barcode TEXT' },
  { name: 'sku', ddl: 'ALTER TABLE materials ADD COLUMN sku TEXT' },
  { name: 'notes', ddl: 'ALTER TABLE materials ADD COLUMN notes TEXT' },
  { name: 'is_active', ddl: 'ALTER TABLE materials ADD COLUMN is_active INTEGER DEFAULT 1' }
]

export const up = async (db: Database): Promise<void> => {
  const columns: Array<{ name: string }> = await db.all(`PRAGMA table_info(materials)`)
  const hasColumn = (name: string) => columns.some((column) => column.name === name)

  for (const column of COLUMNS) {
    if (!hasColumn(column.name)) {
      await db.exec(column.ddl)
    }
  }
}

export const down = async (_db: Database): Promise<void> => {
  // Откат колонок в SQLite требует полного пересоздания таблицы.
  // Эта операция намеренно опущена, чтобы избежать потери данных.
}

export default { up, down }
