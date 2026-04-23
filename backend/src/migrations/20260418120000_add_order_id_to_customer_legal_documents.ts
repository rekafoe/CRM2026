import { Database } from 'sqlite';

/**
 * Журнал выдачи/возврата документов — привязка к заказу.
 */
export async function up(db: Database): Promise<void> {
  const cols = (await db.all("PRAGMA table_info('customer_legal_documents')")) as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'order_id')) {
    await db.run('ALTER TABLE customer_legal_documents ADD COLUMN order_id INTEGER');
    console.log('  customer_legal_documents: added order_id');
  }
  await db.run(
    `CREATE INDEX IF NOT EXISTS idx_customer_legal_documents_order_id ON customer_legal_documents(order_id)`,
  );
}
