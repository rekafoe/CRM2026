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
 * Закупочная цена материала (себестоимость для склада/аналитики).
 * Отпускная остаётся в sheet_price_single и используется калькулятором.
 */
export async function up(db: Database): Promise<void> {
  if (!(await tableExists(db, 'materials'))) {
    return
  }

  if (!(await columnExists(db, 'materials', 'purchase_price'))) {
    await db.exec(`ALTER TABLE materials ADD COLUMN purchase_price REAL`)
  }
}

export async function down(db: Database): Promise<void> {
  // SQLite не поддерживает DROP COLUMN во всех окружениях — оставляем no-op.
  void db
}
