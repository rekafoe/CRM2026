import { Database } from 'sqlite';

/**
 * Флаг «активен для сайта»: при запросе каталога с forSite=1
 * отдаём только продукты с is_active=1 и active_for_site=1.
 */
export async function up(db: Database): Promise<void> {
  const cols = (await db.all("PRAGMA table_info('products')")) as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'active_for_site')) {
    await db.run(`ALTER TABLE products ADD COLUMN active_for_site INTEGER DEFAULT 0`);
    console.log('  products: added active_for_site column');
  }
}
