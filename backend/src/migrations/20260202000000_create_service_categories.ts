import { Database } from 'sqlite';

/**
 * Категории послепечатных услуг (services-management).
 * Таблица service_categories и поле category_id в post_processing_services
 * для группировки услуг в выборе продукта и в калькуляторе.
 */
async function addColumnIfMissing(db: Database, table: string, columnDefinition: string): Promise<void> {
  try {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`);
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : '';
    if (!message.includes('duplicate column name') && !message.includes('no such table')) throw error;
  }
}

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS service_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await addColumnIfMissing(db, 'post_processing_services', 'category_id INTEGER REFERENCES service_categories(id) ON DELETE SET NULL');
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_post_processing_services_category_id ON post_processing_services(category_id)`);
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_post_processing_services_category_id');
  await db.exec('DROP TABLE IF EXISTS service_categories');
}
