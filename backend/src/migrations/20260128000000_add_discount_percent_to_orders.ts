import { Database } from 'sqlite';

/**
 * Добавляет скидку на заказ (процент от итоговой суммы): 0, 5, 10, 15, 20, 25.
 */
export async function up(db: Database): Promise<void> {
  const columns = await db.all(`PRAGMA table_info('orders')`);
  const hasDiscount = (columns as any[]).some((c) => c.name === 'discount_percent');
  if (!hasDiscount) {
    await db.exec(`
      ALTER TABLE orders
      ADD COLUMN discount_percent REAL DEFAULT 0
    `);
  }
}
