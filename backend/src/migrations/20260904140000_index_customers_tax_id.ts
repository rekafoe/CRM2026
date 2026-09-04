import { Database } from 'sqlite'

/** Индекс УНП: точечный поиск юрлица в пуле без скана customers. */
export async function up(db: Database): Promise<void> {
  const table = await db.get<{ name?: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='customers' LIMIT 1`,
  )
  if (!table?.name) return

  const cols = (await db.all(`PRAGMA table_info(customers)`)) as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'tax_id')) return

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_tax_id ON customers (tax_id)`)
}
