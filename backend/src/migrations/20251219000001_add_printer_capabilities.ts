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
    if (!(await columnExists(database, 'printers', 'color_mode'))) {
      await database.exec(
        `ALTER TABLE printers ADD COLUMN color_mode TEXT CHECK (color_mode IN ('bw','color','both')) DEFAULT 'both'`
      )
    }
    if (!(await columnExists(database, 'printers', 'printer_class'))) {
      await database.exec(
        `ALTER TABLE printers ADD COLUMN printer_class TEXT CHECK (printer_class IN ('office','pro')) DEFAULT 'office'`
      )
    }
    await database.exec('COMMIT')
  } catch (e) {
    await database.exec('ROLLBACK')
    throw e
  }
}

export async function down(db?: Database): Promise<void> {
  // SQLite не умеет DROP COLUMN — откат не поддерживаем безопасно
  const database = db || (await getDb())
  await database.exec('BEGIN')
  try {
    await database.exec('COMMIT')
  } catch (e) {
    await database.exec('ROLLBACK')
    throw e
  }
}


