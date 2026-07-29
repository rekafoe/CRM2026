import { Database } from 'sqlite'

/**
 * Ускоряет listUserOrders / search: фильтр по executor_user_id без full scan items.
 */
export async function up(db: Database): Promise<void> {
  const cols = (await db.all(`PRAGMA table_info(items)`)) as Array<{ name: string }>
  const hasExecutor = cols.some((c) => c.name === 'executor_user_id')
  if (!hasExecutor) return

  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_items_executor_order ON items (executor_user_id, orderId)`,
  )
}
