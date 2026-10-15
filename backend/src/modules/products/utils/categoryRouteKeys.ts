import type { Database } from 'sqlite';
import { normalizeProductRouteKey, validateRouteKeySegment } from './routeKeys';

export const normalizeCategoryRouteKey = normalizeProductRouteKey;

/**
 * Ключ категории используется публичным сайтом вместо нестабильного числового id.
 * Уникальность ключей продуктов и категорий независима: это разные URL-пространства.
 */
export async function assertCategoryRouteKeyAllowed(
  db: Database,
  key: string,
  excludeCategoryId: number,
): Promise<void> {
  const validation = validateRouteKeySegment(key);
  if (validation.ok === false) {
    const error = new Error(validation.message);
    (error as any).statusCode = 400;
    throw error;
  }

  const duplicate = await db.get<{ id: number }>(
    `SELECT id
     FROM product_categories
     WHERE lower(trim(route_key)) = ? AND id != ?
     LIMIT 1`,
    [key, excludeCategoryId],
  );
  if (duplicate) {
    const error = new Error(`Ключ «${key}» уже занят другой категорией`);
    (error as any).statusCode = 409;
    throw error;
  }
}
