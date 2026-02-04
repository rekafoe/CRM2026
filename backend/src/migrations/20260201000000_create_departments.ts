import { Database } from 'sqlite'

async function addColumnIfMissing(db: Database, table: string, columnDefinition: string): Promise<void> {
  try {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`)
    console.log(`Added missing column ${table}.${columnDefinition.split(' ')[0]}`)
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : ''
    if (!message.includes('duplicate column name') && !message.includes('no such table')) {
      throw error
    }
  }
}

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await addColumnIfMissing(db, 'users', 'department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL')
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_departments_name ON departments (name)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_users_department_id ON users (department_id)`)
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_users_department_id')
  await db.exec('DROP INDEX IF EXISTS idx_departments_name')
  // SQLite does not support DROP COLUMN in older versions; leave column or recreate table if needed
  await db.exec('DROP TABLE IF EXISTS departments')
}
