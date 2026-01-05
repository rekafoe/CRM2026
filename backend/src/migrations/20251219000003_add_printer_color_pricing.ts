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
    // Per-sheet pricing (laser/uv etc.)
    if (!(await columnExists(database, 'printers', 'price_bw_single'))) {
      await database.exec(`ALTER TABLE printers ADD COLUMN price_bw_single REAL`)
    }
    if (!(await columnExists(database, 'printers', 'price_bw_duplex'))) {
      await database.exec(`ALTER TABLE printers ADD COLUMN price_bw_duplex REAL`)
    }
    if (!(await columnExists(database, 'printers', 'price_color_single'))) {
      await database.exec(`ALTER TABLE printers ADD COLUMN price_color_single REAL`)
    }
    if (!(await columnExists(database, 'printers', 'price_color_duplex'))) {
      await database.exec(`ALTER TABLE printers ADD COLUMN price_color_duplex REAL`)
    }

    // Per-meter pricing (wideformat)
    if (!(await columnExists(database, 'printers', 'price_bw_per_meter'))) {
      await database.exec(`ALTER TABLE printers ADD COLUMN price_bw_per_meter REAL`)
    }
    if (!(await columnExists(database, 'printers', 'price_color_per_meter'))) {
      await database.exec(`ALTER TABLE printers ADD COLUMN price_color_per_meter REAL`)
    }

    await database.exec('COMMIT')
  } catch (e) {
    await database.exec('ROLLBACK')
    throw e
  }
}

export async function down(db?: Database): Promise<void> {
  // SQLite не умеет DROP COLUMN — безопасный откат не делаем
  const database = db || (await getDb())
  await database.exec('BEGIN')
  try {
    await database.exec('COMMIT')
  } catch (e) {
    await database.exec('ROLLBACK')
    throw e
  }
}


