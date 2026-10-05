import { Database } from 'sqlite'

async function columnExists(db: Database, table: string, column: string): Promise<boolean> {
  const rows = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${table})`)
  return rows.some((row) => row.name === column)
}

const PRINT_COST_COLUMNS = [
  'cost_per_impression',
  'cost_bw_per_meter',
  'cost_color_per_meter',
  'cost_color_per_m2',
  'cost_white_per_m2',
  'cost_varnish_per_m2',
] as const

/** Ставки контактёра и ответственного и себестоимость печати рядом с отпускной ценой. */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS crm_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await db.run(
    `INSERT OR IGNORE INTO crm_settings (setting_key, setting_value, updated_at)
     VALUES ('contact_order_percent', '1', datetime('now'))`,
  )
  await db.run(
    `INSERT OR IGNORE INTO crm_settings (setting_key, setting_value, updated_at)
     VALUES ('responsible_order_percent', '5', datetime('now'))`,
  )

  const table = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'print_prices'`,
  )
  if (!table) return
  for (const column of PRINT_COST_COLUMNS) {
    if (!(await columnExists(db, 'print_prices', column))) {
      await db.exec(`ALTER TABLE print_prices ADD COLUMN ${column} REAL`)
    }
  }
}

export async function down(_db: Database): Promise<void> {
  // Колонки и настройки не откатываем: их уже могли заполнить.
}
