import { Database } from 'sqlite'

type TableInfoRow = { name: string }

async function tableExists(db: Database, table: string): Promise<boolean> {
  const row = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table],
  )
  return !!row
}

async function columnExists(db: Database, table: string, column: string): Promise<boolean> {
  if (!(await tableExists(db, table))) return false
  const rows = await db.all<TableInfoRow[]>(`PRAGMA table_info('${table}')`)
  return rows.some((row) => row.name === column)
}

/**
 * Эталон толщины листа (на плотность), корешок крышки и диапазон канала.
 * Пустые значения не меняют уже заведённые материалы.
 */
export async function up(db: Database): Promise<void> {
  if (!(await tableExists(db, 'materials'))) return

  const columns = [
    'sheet_thickness_mm',
    'spine_thickness_mm',
    'channel_min_mm',
    'channel_max_mm',
  ]
  for (const column of columns) {
    if (!(await columnExists(db, 'materials', column))) {
      await db.exec(`ALTER TABLE materials ADD COLUMN ${column} REAL`)
    }
  }
}

export async function down(db: Database): Promise<void> {
  void db
}
