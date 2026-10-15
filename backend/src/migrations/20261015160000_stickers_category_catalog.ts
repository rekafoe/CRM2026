import type { Database } from 'sqlite';

const TARGET_CATEGORY_NAME = 'Наклейки';
const TARGET_ROUTE_KEY = 'stickers';
const DUPLICATE_CATEGORY_NAMES = new Set([
  'наклейки, стикеры',
  'наклейки и стикеры',
]);

function normalizeRussian(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function isStickerProductName(value: unknown): boolean {
  const name = normalizeRussian(value);
  return name.includes('наклей') || name.includes('стикер');
}

async function hasColumn(db: Database, table: string, column: string): Promise<boolean> {
  const rows = await db.all<Array<{ name: string }>>(`PRAGMA table_info('${table}')`);
  return rows.some((row) => row.name === column);
}

/**
 * Собирает все продукты-наклейки в одной категории для публичного раздела.
 * Активность продуктов не меняется: сайту по-прежнему доступны только строки
 * с is_active=1 и active_for_site=1.
 */
export async function up(db: Database): Promise<void> {
  if (!(await hasColumn(db, 'product_categories', 'name'))) return;
  if (!(await hasColumn(db, 'products', 'category_id'))) return;

  await db.exec('BEGIN');
  try {
    if (!(await hasColumn(db, 'product_categories', 'route_key'))) {
      await db.run(`ALTER TABLE product_categories ADD COLUMN route_key TEXT`);
    }

    const categories = await db.all<Array<{
      id: number;
      name: string;
      is_active?: number;
      image_url?: string | null;
    }>>(
      `SELECT id, name, is_active, image_url
       FROM product_categories
       ORDER BY CASE WHEN name = ? THEN 0 ELSE 1 END, is_active DESC, id`,
      [TARGET_CATEGORY_NAME],
    );

    let target = categories.find((category) => normalizeRussian(category.name) === 'наклейки');
    if (!target) {
      const result = await db.run(
        `INSERT INTO product_categories
         (name, icon, description, sort_order, is_active, route_key, created_at, updated_at)
         VALUES (?, NULL, ?, 0, 1, ?, datetime('now'), datetime('now'))`,
        [
          TARGET_CATEGORY_NAME,
          'Наклейки, этикетки и стикерпаки',
          TARGET_ROUTE_KEY,
        ],
      );
      target = {
        id: Number(result.lastID),
        name: TARGET_CATEGORY_NAME,
        is_active: 1,
        image_url: null,
      };
    }

    const duplicateCategories = categories.filter((category) => {
      if (Number(category.id) === Number(target!.id)) return false;
      const normalized = normalizeRussian(category.name);
      return normalized === 'наклейки' || DUPLICATE_CATEGORY_NAMES.has(normalized);
    });

    // Освобождаем ключ до создания уникального индекса: старые ручные данные
    // могли уже содержать `stickers` у другой категории.
    await db.run(
      `UPDATE product_categories
       SET route_key = NULL
       WHERE lower(trim(COALESCE(route_key, ''))) = ? AND id != ?`,
      [TARGET_ROUTE_KEY, target.id],
    );

    const duplicateIds = duplicateCategories.map((category) => Number(category.id));
    for (const duplicateId of duplicateIds) {
      await db.run(
        `UPDATE products SET category_id = ? WHERE category_id = ?`,
        [target.id, duplicateId],
      );
    }

    const products = await db.all<Array<{ id: number; name: string; category_id: number }>>(
      `SELECT id, name, category_id FROM products`,
    );
    for (const product of products) {
      if (!isStickerProductName(product.name)) continue;
      if (Number(product.category_id) === Number(target.id)) continue;
      await db.run(
        `UPDATE products
         SET category_id = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [target.id, product.id],
      );
    }

    let inheritedImage: string | null = target.image_url ?? null;
    if (!inheritedImage) {
      inheritedImage =
        duplicateCategories.find((category) => category.image_url)?.image_url ?? null;
    }

    await db.run(
      `UPDATE product_categories
       SET name = ?,
           description = COALESCE(NULLIF(trim(description), ''), ?),
           image_url = COALESCE(image_url, ?),
           route_key = ?,
           is_active = 1,
           updated_at = datetime('now')
       WHERE id = ?`,
      [
        TARGET_CATEGORY_NAME,
        'Наклейки, этикетки и стикерпаки',
        inheritedImage,
        TARGET_ROUTE_KEY,
        target.id,
      ],
    );

    for (const duplicateId of duplicateIds) {
      await db.run(
        `UPDATE product_categories
         SET is_active = 0, route_key = NULL, updated_at = datetime('now')
         WHERE id = ?`,
        [duplicateId],
      );
    }

    await db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_route_key_unique
      ON product_categories(route_key)
      WHERE route_key IS NOT NULL AND trim(route_key) != ''
    `);

    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export async function down(db: Database): Promise<void> {
  if (!(await hasColumn(db, 'product_categories', 'route_key'))) return;
  await db.run(
    `UPDATE product_categories SET route_key = NULL WHERE route_key = ?`,
    [TARGET_ROUTE_KEY],
  );
  await db.run(`DROP INDEX IF EXISTS idx_product_categories_route_key_unique`);
  // Перенос продуктов и объединение дублей намеренно не откатываются:
  // исходная принадлежность после слияния неоднозначна.
}
