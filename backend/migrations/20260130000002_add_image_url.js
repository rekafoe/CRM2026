/**
 * Миграция: добавление поля image_url в product_categories и products
 * Для отображения изображений на сайте (каталог).
 */

async function up(db) {
  const catCols = await db.all("PRAGMA table_info('product_categories')");
  if (!catCols.some(c => c.name === 'image_url')) {
    await db.run(`ALTER TABLE product_categories ADD COLUMN image_url TEXT`);
    console.log('✅ product_categories: добавлено поле image_url');
  } else {
    console.log('ℹ️ product_categories: поле image_url уже существует');
  }

  const prodCols = await db.all("PRAGMA table_info('products')");
  if (!prodCols.some(c => c.name === 'image_url')) {
    await db.run(`ALTER TABLE products ADD COLUMN image_url TEXT`);
    console.log('✅ products: добавлено поле image_url');
  } else {
    console.log('ℹ️ products: поле image_url уже существует');
  }
}

async function down(db) {
  console.log('⚠️ SQLite не поддерживает DROP COLUMN напрямую. Поля image_url останутся.');
}

module.exports = { up, down };
