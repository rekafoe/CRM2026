import { Database } from 'sqlite';

export async function up(db: Database): Promise<void> {
  const columns = await db.all(`PRAGMA table_info('post_processing_services')`);
  const hasMaxQuantity = columns.some((column: any) => column.name === 'max_quantity');
  if (!hasMaxQuantity) {
    await db.exec(`
      ALTER TABLE post_processing_services
      ADD COLUMN max_quantity INTEGER
    `);
  }
}

