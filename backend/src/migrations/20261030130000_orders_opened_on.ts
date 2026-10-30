import { Database } from 'sqlite'

/** День, когда заказ был создан. Передача сдвигает created_at, этот день остаётся для контактёра. */
export async function up(db: Database): Promise<void> {
  const columns = (await db.all("PRAGMA table_info('orders')")) as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'opened_on')) {
    await db.run('ALTER TABLE orders ADD COLUMN opened_on TEXT')
  }
  await db.run(
    `UPDATE orders
        SET opened_on = substr(COALESCE(created_at, createdAt), 1, 10)
      WHERE opened_on IS NULL OR trim(opened_on) = ''`,
  )
}

export async function down(db: Database): Promise<void> {
  try {
    await db.run('ALTER TABLE orders DROP COLUMN opened_on')
  } catch {
    // Старый SQLite не умеет DROP COLUMN.
  }
}
