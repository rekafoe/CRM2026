/**
 * УФ-планшет: ценообразование по м² (слои color/white/varnish) + ступени по суммарной площади тиража.
 */

import { Database } from 'sqlite'
import { getDb } from '../db'

async function columnExists(db: Database, table: string, column: string): Promise<boolean> {
  const rows = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${table})`)
  return rows.some((r) => r.name === column)
}

async function tableExists(db: Database, table: string): Promise<boolean> {
  const row = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    table,
  )
  return !!row
}

export async function up(db?: Database): Promise<void> {
  const database = db || (await getDb())

  await database.exec('BEGIN')
  try {
    const m2Columns: Array<[string, string]> = [
      ['price_color_per_m2', 'REAL'],
      ['price_white_per_m2', 'REAL'],
      ['price_varnish_per_m2', 'REAL'],
      ['min_charge', 'REAL DEFAULT 0'],
      ['max_width_mm', 'INTEGER DEFAULT 600'],
      ['max_height_mm', 'INTEGER DEFAULT 900'],
    ]
    for (const [col, type] of m2Columns) {
      if (!(await columnExists(database, 'print_prices', col))) {
        await database.exec(`ALTER TABLE print_prices ADD COLUMN ${col} ${type}`)
      }
    }

    await database.exec(`
      CREATE TABLE IF NOT EXISTS print_price_m2_tiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        print_price_id INTEGER NOT NULL,
        layer TEXT NOT NULL CHECK(layer IN ('color','white','varnish')),
        min_m2 REAL NOT NULL DEFAULT 0,
        max_m2 REAL,
        price_per_m2 REAL NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(print_price_id) REFERENCES print_prices(id) ON DELETE CASCADE,
        UNIQUE(print_price_id, layer, min_m2)
      )
    `)
    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_print_price_m2_tiers_print_price_id
      ON print_price_m2_tiers(print_price_id)
    `)

    const ppRow = await database.get<{ sql: string }>(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'print_prices'`,
    )
    const ppSql = ppRow?.sql ?? ''
    if (ppSql && !ppSql.includes("'m2'")) {
      await database.exec('PRAGMA foreign_keys=OFF')
      await database.exec(`
        CREATE TABLE print_prices_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          technology_code TEXT NOT NULL,
          counter_unit TEXT CHECK(counter_unit IN ('sheets','meters','m2')) NOT NULL DEFAULT 'sheets',
          price_bw_single REAL,
          price_bw_duplex REAL,
          price_color_single REAL,
          price_color_duplex REAL,
          price_bw_per_meter REAL,
          price_color_per_meter REAL,
          sheet_width_mm INTEGER DEFAULT 320,
          sheet_height_mm INTEGER DEFAULT 450,
          price_color_per_m2 REAL,
          price_white_per_m2 REAL,
          price_varnish_per_m2 REAL,
          min_charge REAL DEFAULT 0,
          max_width_mm INTEGER DEFAULT 600,
          max_height_mm INTEGER DEFAULT 900,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `)
      await database.exec(`
        INSERT INTO print_prices_new (
          id, technology_code, counter_unit,
          price_bw_single, price_bw_duplex, price_color_single, price_color_duplex,
          price_bw_per_meter, price_color_per_meter,
          sheet_width_mm, sheet_height_mm,
          price_color_per_m2, price_white_per_m2, price_varnish_per_m2,
          min_charge, max_width_mm, max_height_mm,
          is_active, created_at, updated_at
        )
        SELECT
          id, technology_code, counter_unit,
          price_bw_single, price_bw_duplex, price_color_single, price_color_duplex,
          price_bw_per_meter, price_color_per_meter,
          sheet_width_mm, sheet_height_mm,
          price_color_per_m2, price_white_per_m2, price_varnish_per_m2,
          min_charge, max_width_mm, max_height_mm,
          is_active, created_at, updated_at
        FROM print_prices
      `)
      await database.exec('DROP TABLE print_prices')
      await database.exec('ALTER TABLE print_prices_new RENAME TO print_prices')
      await database.exec(`
        CREATE INDEX IF NOT EXISTS idx_print_prices_technology_active
          ON print_prices (technology_code, is_active)
      `)
      await database.exec('PRAGMA foreign_keys=ON')
    }

    if (await tableExists(database, 'print_technologies')) {
      const techRow = await database.get<{ sql: string }>(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'print_technologies'`,
      )
      const sql = techRow?.sql ?? ''
      if (!sql.includes('per_m2')) {
        await database.exec(`
          CREATE TABLE print_technologies_new (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            pricing_mode TEXT CHECK (pricing_mode IN ('per_sheet', 'per_meter', 'per_m2')) NOT NULL,
            supports_duplex INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          )
        `)
        await database.exec(`
          INSERT INTO print_technologies_new (code, name, pricing_mode, supports_duplex, is_active, created_at, updated_at)
          SELECT code, name, pricing_mode, supports_duplex, is_active, created_at, updated_at FROM print_technologies
        `)
        await database.exec('DROP TABLE print_technologies')
        await database.exec('ALTER TABLE print_technologies_new RENAME TO print_technologies')
      }
      await database.run(
        `UPDATE print_technologies SET pricing_mode = 'per_m2', updated_at = datetime('now') WHERE code = 'uv'`,
      )
    }

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
    await database.exec('DROP TABLE IF EXISTS print_price_m2_tiers')
    await database.run(`UPDATE print_technologies SET pricing_mode = 'per_sheet' WHERE code = 'uv'`)
    await database.exec('COMMIT')
  } catch (e) {
    await database.exec('ROLLBACK')
    throw e
  }
}
