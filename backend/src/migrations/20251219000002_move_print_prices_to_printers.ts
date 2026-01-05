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
    // Цены печати храним на уровне принтера (разная себестоимость на разном оборудовании)
    if (!(await columnExists(database, 'printers', 'price_single'))) {
      await database.exec(`ALTER TABLE printers ADD COLUMN price_single REAL`)
    }
    if (!(await columnExists(database, 'printers', 'price_duplex'))) {
      await database.exec(`ALTER TABLE printers ADD COLUMN price_duplex REAL`)
    }
    if (!(await columnExists(database, 'printers', 'price_per_meter'))) {
      await database.exec(`ALTER TABLE printers ADD COLUMN price_per_meter REAL`)
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


