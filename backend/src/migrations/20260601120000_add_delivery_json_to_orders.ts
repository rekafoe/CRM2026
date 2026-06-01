import { Database } from 'sqlite'

/**
 * Способ получения / доставка заказа с сайта (JSON).
 */
export async function up(db: Database): Promise<void> {
  const columns = await db.all(`PRAGMA table_info('orders')`)
  const hasCol = (columns as Array<{ name: string }>).some((c) => c.name === 'delivery_json')
  if (!hasCol) {
    await db.exec(`ALTER TABLE orders ADD COLUMN delivery_json TEXT`)
  }
}

export async function down(_db: Database): Promise<void> {
  // SQLite не поддерживает DROP COLUMN
}
