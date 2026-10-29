import { Database } from 'sqlite'

/** Необязательное ФИО пользователя CRM в родительном падеже: «в лице менеджера …». */
export async function up(db: Database): Promise<void> {
  const columns = (await db.all("PRAGMA table_info('users')")) as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'name_genitive')) {
    await db.run('ALTER TABLE users ADD COLUMN name_genitive TEXT')
  }
}

export async function down(db: Database): Promise<void> {
  try {
    await db.run('ALTER TABLE users DROP COLUMN name_genitive')
  } catch {
    // SQLite без DROP COLUMN оставляет поле.
  }
}
