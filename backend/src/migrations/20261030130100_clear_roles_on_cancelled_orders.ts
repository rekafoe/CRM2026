import { Database } from 'sqlite'

/** Отмена раньше могла оставить исполнителя на позициях. Снимаем роли с уже отменённых заказов. */
export async function up(db: Database): Promise<void> {
  const orderCols = (await db.all("PRAGMA table_info('orders')")) as Array<{ name: string }>
  const orderNames = new Set(orderCols.map((column) => column.name))
  if (!orderNames.has('is_cancelled')) return

  const itemCols = (await db.all("PRAGMA table_info('items')")) as Array<{ name: string }>
  if (itemCols.some((column) => column.name === 'executor_user_id')) {
    await db.run(
      `UPDATE items
          SET executor_user_id = NULL
        WHERE executor_user_id IS NOT NULL
          AND orderId IN (SELECT id FROM orders WHERE COALESCE(is_cancelled, 0) = 1)`,
    )
  }
  if (orderNames.has('contact_user_id')) {
    await db.run(
      `UPDATE orders SET contact_user_id = NULL WHERE COALESCE(is_cancelled, 0) = 1 AND contact_user_id IS NOT NULL`,
    )
  }
  if (orderNames.has('responsible_user_id')) {
    await db.run(
      `UPDATE orders SET responsible_user_id = NULL WHERE COALESCE(is_cancelled, 0) = 1 AND responsible_user_id IS NOT NULL`,
    )
  }
}

export async function down(_db: Database): Promise<void> {
  // Роли на отменённых заказах не восстанавливаем.
}
