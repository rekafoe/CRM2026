import { Database } from 'sqlite'

/**
 * Личная переписка двух пользователей CRM в тех же таблицах, что и чат сайта.
 * Пара неупорядоченная: меньший id слева, больший справа.
 */
async function addColumn(db: Database, column: string, definition: string) {
  const columns = await db.all<Array<{ name: string }>>('PRAGMA table_info(support_conversations)')
  if (columns.some((item) => item.name === column)) return
  await db.exec(`ALTER TABLE support_conversations ADD COLUMN ${column} ${definition}`)
}

export async function up(db: Database): Promise<void> {
  await addColumn(db, 'staff_low_id', 'INTEGER')
  await addColumn(db, 'staff_high_id', 'INTEGER')
  await addColumn(db, 'staff_low_unread', 'INTEGER NOT NULL DEFAULT 0')
  await addColumn(db, 'staff_high_unread', 'INTEGER NOT NULL DEFAULT 0')
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_support_conversations_staff_pair
      ON support_conversations(staff_low_id, staff_high_id)
      WHERE channel = 'staff'
  `)
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_support_conversations_staff_pair')
}
