import { Database } from 'sqlite'

/**
 * Гарантируем, что в системе есть хотя бы одна категория продуктов.
 * Иначе создание продукта (products.category_id NOT NULL + FK) будет падать.
 */
export async function up(db: Database) {
  await db.exec(`
    INSERT INTO product_categories (name, icon, description, sort_order, is_active, created_at, updated_at)
    SELECT
      'Без категории',
      '',
      'Системная категория по умолчанию',
      0,
      1,
      datetime('now'),
      datetime('now')
    WHERE NOT EXISTS (SELECT 1 FROM product_categories);
  `)
}

export async function down(db: Database) {
  // Удаляем только если категория действительно "системная" и больше ничего нет
  await db.exec(`
    DELETE FROM product_categories
    WHERE name = 'Без категории'
      AND (description IS NULL OR description = 'Системная категория по умолчанию');
  `)
}


