import { Database } from 'sqlite';

/**
 * Ключ для ЧПУ калькулятора/витрины (например …/calculator/fotopechat вместо …/calculator/43).
 * Уникальность обеспечивается частичным индексом + проверкой пересечений с key подтипов в шаблонах.
 */
export async function up(db: Database): Promise<void> {
  const cols = (await db.all("PRAGMA table_info('products')")) as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'route_key')) {
    await db.run(`ALTER TABLE products ADD COLUMN route_key TEXT`);
    console.log('  products: added route_key column');
  }
  await db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_route_key_unique
    ON products(route_key)
    WHERE route_key IS NOT NULL AND trim(route_key) != ''
  `);
}
