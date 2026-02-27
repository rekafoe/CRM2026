import { Database } from 'sqlite';

/**
 * Добавляет notes (примечания/описание) к заказам.
 */
export async function up(db: Database): Promise<void> {
  const columns = await db.all(`PRAGMA table_info('orders')`);
  const hasNotes = (columns as any[]).some((c) => c.name === 'notes');
  if (!hasNotes) {
    await db.exec(`ALTER TABLE orders ADD COLUMN notes TEXT`);
  }
}

export async function down(db: Database): Promise<void> {
  // SQLite не поддерживает DROP COLUMN
}
