import { Database } from 'sqlite';

export async function up(db: Database): Promise<void> {
  const columns = await db.all(`PRAGMA table_info('products')`);
  const hasOperatorPercent = columns.some((column: any) => column.name === 'operator_percent');
  if (!hasOperatorPercent) {
    await db.exec(`
      ALTER TABLE products
      ADD COLUMN operator_percent REAL DEFAULT 0
    `);
  }
}
