/**
 * Добавляет диапазоны тиража для цен печати (по листам SRA3).
 * - print_prices: sheet_width_mm, sheet_height_mm — размер печатного листа
 * - print_price_tiers: min_sheets, max_sheets, price_per_sheet — цена за лист по диапазону
 */

import { Database } from 'sqlite'
import { getDb } from '../db'

async function columnExists(db: Database, table: string, column: string): Promise<boolean> {
  const rows = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${table})`)
  return rows.some((r) => r.name === column)
}

export async function up(db?: Database): Promise<void> {
  const database = db || (await getDb())

  await database.exec('BEGIN')
  try {
    // Размер печатного листа (SRA3 = 320×450 по умолчанию)
    if (!(await columnExists(database, 'print_prices', 'sheet_width_mm'))) {
      await database.exec(`ALTER TABLE print_prices ADD COLUMN sheet_width_mm INTEGER DEFAULT 320`)
    }
    if (!(await columnExists(database, 'print_prices', 'sheet_height_mm'))) {
      await database.exec(`ALTER TABLE print_prices ADD COLUMN sheet_height_mm INTEGER DEFAULT 450`)
    }

    // Таблица диапазонов: цена за лист по количеству листов
    await database.exec(`
      CREATE TABLE IF NOT EXISTS print_price_tiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        print_price_id INTEGER NOT NULL,
        price_mode TEXT NOT NULL CHECK(price_mode IN ('bw_single','bw_duplex','color_single','color_duplex')),
        min_sheets INTEGER NOT NULL DEFAULT 1,
        max_sheets INTEGER,
        price_per_sheet REAL NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(print_price_id) REFERENCES print_prices(id) ON DELETE CASCADE,
        UNIQUE(print_price_id, price_mode, min_sheets)
      )
    `)
    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_print_price_tiers_print_price_id
      ON print_price_tiers(print_price_id)
    `)

    await database.exec('COMMIT')
  } catch (e) {
    await database.exec('ROLLBACK')
    throw e
  }
}

export async function down(db?: Database): Promise<void> {
  const database = db || (await getDb())
  await database.exec('BEGIN')
  try {
    await database.exec('DROP TABLE IF EXISTS print_price_tiers')
    // SQLite не умеет DROP COLUMN — оставляем sheet_width_mm, sheet_height_mm
    await database.exec('COMMIT')
  } catch (e) {
    await database.exec('ROLLBACK')
    throw e
  }
}
