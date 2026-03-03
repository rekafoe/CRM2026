import { Database } from 'sqlite';

/**
 * Добавляет роли для заказов и позиций:
 * - contact_user_id: контактёр (создал заказ, общался с клиентом)
 * - responsible_user_id: ответственный (выполняет заказ)
 * - executor_user_id (в items): исполнитель (выполняет позицию)
 */
export async function up(db: Database): Promise<void> {
  const orderCols = await db.all(`PRAGMA table_info('orders')`) as Array<{ name: string }>;
  const orderNames = orderCols.map((c) => c.name);

  if (!orderNames.includes('contact_user_id')) {
    await db.exec(`
      ALTER TABLE orders ADD COLUMN contact_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    `);
  }
  if (!orderNames.includes('responsible_user_id')) {
    await db.exec(`
      ALTER TABLE orders ADD COLUMN responsible_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    `);
  }

  const itemCols = await db.all(`PRAGMA table_info('items')`) as Array<{ name: string }>;
  const itemNames = itemCols.map((c) => c.name);
  if (!itemNames.includes('executor_user_id')) {
    await db.exec(`
      ALTER TABLE items ADD COLUMN executor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    `);
  }
}

export async function down(db: Database): Promise<void> {
  // SQLite не поддерживает DROP COLUMN
}
