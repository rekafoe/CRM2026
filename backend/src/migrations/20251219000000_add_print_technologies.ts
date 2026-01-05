import { Database } from 'sqlite'
import { getDb } from '../db'

const TECHNOLOGIES = [
  { code: 'laser_sheet', name: 'Лазерный листовой', pricing_mode: 'per_sheet', supports_duplex: 1 },
  { code: 'laser_wide', name: 'Лазерный ШФП', pricing_mode: 'per_meter', supports_duplex: 0 },
  { code: 'inkjet_pigment', name: 'Струйный пигментный', pricing_mode: 'per_meter', supports_duplex: 0 },
  { code: 'inkjet_solvent', name: 'Струйный сольвентный', pricing_mode: 'per_meter', supports_duplex: 0 },
  { code: 'uv', name: 'УФ', pricing_mode: 'per_sheet', supports_duplex: 1 },
]

async function columnExists(db: Database, table: string, column: string): Promise<boolean> {
  const rows = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${table})`)
  return rows.some((r) => r.name === column)
}

export async function up(db?: Database): Promise<void> {
  const database = db || (await getDb())

  await database.exec('BEGIN')
  try {
    await database.exec(`
      CREATE TABLE IF NOT EXISTS print_technologies (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pricing_mode TEXT CHECK (pricing_mode IN ('per_sheet', 'per_meter')) NOT NULL,
        supports_duplex INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    await database.exec(`
      CREATE TABLE IF NOT EXISTS print_technology_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        technology_code TEXT NOT NULL,
        price_single REAL,
        price_duplex REAL,
        price_per_meter REAL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (technology_code) REFERENCES print_technologies(code) ON DELETE CASCADE,
        UNIQUE(technology_code)
      )
    `)

    if (!(await columnExists(database, 'printers', 'technology_code'))) {
      await database.exec(`ALTER TABLE printers ADD COLUMN technology_code TEXT`)
    }
    if (!(await columnExists(database, 'printers', 'counter_unit'))) {
      await database.exec(
        `ALTER TABLE printers ADD COLUMN counter_unit TEXT CHECK (counter_unit IN ('sheets','meters')) DEFAULT 'sheets'`
      )
    }
    if (!(await columnExists(database, 'printers', 'max_width_mm'))) {
      await database.exec(`ALTER TABLE printers ADD COLUMN max_width_mm REAL`)
    }

    for (const tech of TECHNOLOGIES) {
      await database.run(
        `INSERT OR IGNORE INTO print_technologies (code, name, pricing_mode, supports_duplex, is_active) VALUES (?, ?, ?, ?, 1)`,
        tech.code,
        tech.name,
        tech.pricing_mode,
        tech.supports_duplex
      )
      await database.run(
        `INSERT OR IGNORE INTO print_technology_prices (technology_code, price_single, price_duplex, price_per_meter, is_active)
         VALUES (?, NULL, NULL, NULL, 1)`,
        tech.code
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
    await database.exec(`DROP TABLE IF EXISTS print_technology_prices`)
    await database.exec(`DROP TABLE IF EXISTS print_technologies`)
    await database.exec('COMMIT')
  } catch (e) {
    await database.exec('ROLLBACK')
    throw e
  }
}

