import type { Database } from 'sqlite';
import { extractMinUnitPrice } from '../routes/helpers';
import { normalizeCategoryRouteKey } from '../utils/categoryRouteKeys';

export type SiteCategoryCatalog = {
  category: Record<string, any>;
  products: Array<Record<string, any>>;
};

/**
 * Публичная витрина одной категории. Всегда исключает внутренние и выключенные
 * продукты, даже если вызвана из авторизованного CRM-контекста.
 */
export async function loadSiteCategoryCatalog(
  db: Database,
  rawRouteKey: unknown,
  withMinPrice = false,
): Promise<SiteCategoryCatalog | null> {
  const routeKey = normalizeCategoryRouteKey(rawRouteKey);
  if (!routeKey) return null;

  const category = await db.get<Record<string, any>>(
    `SELECT *
     FROM product_categories
     WHERE lower(trim(route_key)) = ? AND is_active = 1
     LIMIT 1`,
    [routeKey],
  );
  if (!category) return null;

  const products = await db.all<Array<Record<string, any>>>(
    `SELECT p.*, pc.name AS category_name, pc.icon AS category_icon
     FROM products p
     JOIN product_categories pc ON pc.id = p.category_id
     WHERE p.category_id = ?
       AND p.is_active = 1
       AND COALESCE(p.active_for_site, 0) = 1
     ORDER BY p.name`,
    [category.id],
  ) as unknown as Array<Record<string, any>>;

  if (withMinPrice && products.length > 0) {
    const productIds = products.map((product) => Number(product.id));
    const placeholders = productIds.map(() => '?').join(',');
    const configs = await db.all<Array<{ product_id: number; config_data: string | null }>>(
      `SELECT product_id, config_data
       FROM product_template_configs
       WHERE product_id IN (${placeholders})
         AND name = 'template'
         AND is_active = 1`,
      productIds,
    ) as unknown as Array<{ product_id: number; config_data: string | null }>;
    const minPriceByProduct = new Map<number, number>();
    for (const config of configs) {
      const minPrice = extractMinUnitPrice(config.config_data);
      if (minPrice != null) minPriceByProduct.set(Number(config.product_id), minPrice);
    }
    for (const product of products) {
      product.min_price = minPriceByProduct.get(Number(product.id)) ?? null;
    }
  }

  return { category, products };
}
