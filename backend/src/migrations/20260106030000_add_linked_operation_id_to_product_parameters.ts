import { Database } from 'sqlite'

export async function up(db: Database) {
  // Добавляем колонку, если её нет (Railway/старые БД)
  const cols: Array<{ name: string }> = await db.all(`PRAGMA table_info(product_parameters)`)
  const has = cols.some((c) => c.name === 'linked_operation_id')
  if (!has) {
    await db.exec(`ALTER TABLE product_parameters ADD COLUMN linked_operation_id INTEGER`)
  }
}

export async function down(db: Database) {
  // SQLite не поддерживает DROP COLUMN без пересоздания таблицы — безопасно оставляем как есть
  await db.exec(`SELECT 1`)
}


