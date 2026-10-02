/**
 * СОЗДАНИЕ ШАБЛОНОВ ПРОДУКТОВ
 * 
 * Node.js скрипт для создания базовых продуктов с параметрами
 * Использование: node backend/scripts/seed-product-templates.js
 */

const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('./db-config');

console.log(`Используем БД: ${DB_PATH}\n`);

async function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

async function seedProducts() {
  const db = new sqlite3.Database(DB_PATH);
  
  console.log('Начинаем создание шаблонов продуктов...\n');
  
  try {
    // Создаем таблицы, если их нет
    console.log('Проверка и создание таблиц...');
    
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS product_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        icon TEXT,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        calculator_type TEXT DEFAULT 'product',
        product_type TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(category_id) REFERENCES product_categories(id) ON DELETE CASCADE
      )
    `);
    
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS product_parameters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        label TEXT NOT NULL,
        type TEXT NOT NULL,
        options TEXT,
        min_value REAL,
        max_value REAL,
        step REAL,
        default_value TEXT,
        is_required INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        linked_operation_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);
    
    console.log('Таблицы готовы\n');
    
    // Создаем категорию
    console.log('Создание категории...');
    const categoryId = await runQuery(db, `
      INSERT OR IGNORE INTO product_categories (name, icon, description, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?)
    `, ['Печатная продукция', '', 'Листовки, визитки, документы', 1, 1]);
    
    console.log(`Категория создана (ID: ${categoryId || 1})\n`);
    
    // =============================================
    // 1. ЛИСТОВКИ
    // =============================================
    console.log('Создание продукта: Листовки...');
    const flyersId = await runQuery(db, `
      INSERT INTO products (name, description, category_id, icon, calculator_type, product_type, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, ['Листовки', 'Цветные листовки различных форматов', categoryId || 1, '', 'product', 'sheet_single', 1]);
    
    const flyersParams = [
      { name: 'format', label: 'Формат', type: 'select', options: ['A6', 'A5', 'A4', 'A3'], required: 1, sort: 1 },
      { name: 'quantity', label: 'Количество', type: 'number', min: 1, max: 100000, required: 1, sort: 2 },
      { name: 'sides', label: 'Стороны печати', type: 'select', options: ['1', '2'], required: 1, sort: 3 },
      { name: 'paper_type', label: 'Тип бумаги', type: 'select', options: ['Мелованная глянцевая', 'Мелованная матовая', 'Офсетная'], required: 1, sort: 4 },
      { name: 'paper_density', label: 'Плотность', type: 'select', options: ['130', '150', '200', '300'], required: 1, sort: 5 },
      { name: 'lamination', label: 'Ламинирование', type: 'select', options: ['Нет', 'Матовое', 'Глянцевое'], required: 0, sort: 6 },
      { name: 'urgency', label: 'Срочность', type: 'select', options: ['standard', 'urgent', 'express'], required: 1, sort: 7 }
    ];
    
    for (const param of flyersParams) {
      await runQuery(db, `
        INSERT INTO product_parameters (product_id, name, label, type, options, min_value, max_value, is_required, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [flyersId, param.name, param.label, param.type, param.options ? JSON.stringify(param.options) : null, 
          param.min || null, param.max || null, param.required, param.sort]);
    }
    console.log(`Листовки созданы (ID: ${flyersId}, параметров: ${flyersParams.length})\n`);
    
    // =============================================
    // 2. ВИЗИТКИ
    // =============================================
    console.log('Создание продукта: Визитки...');
    const cardsId = await runQuery(db, `
      INSERT INTO products (name, description, category_id, icon, calculator_type, product_type, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, ['Визитки', 'Визитные карточки различных типов', categoryId || 1, '', 'product', 'sheet_item', 1]);
    
    const cardsParams = [
      { name: 'card_type', label: 'Тип визитки', type: 'select', options: ['Стандартные', 'Ламинированные', 'Черно-белые', 'Магнитные', 'На пластике'], required: 1, sort: 1 },
      { name: 'size', label: 'Размер', type: 'select', options: ['85x55', '90x50'], required: 1, sort: 2 },
      { name: 'quantity', label: 'Количество', type: 'number', min: 50, max: 10000, required: 1, sort: 3 },
      { name: 'orientation', label: 'Ориентация', type: 'select', options: ['Горизонтальная', 'Вертикальная'], required: 1, sort: 4 },
      { name: 'sides', label: 'Печать', type: 'select', options: ['Односторонняя', 'Двухсторонняя'], required: 1, sort: 5 },
      { name: 'print_type', label: 'Тип печати', type: 'select', options: ['Лазерная цветная профессиональная', 'Лазерная черно-белая профессиональная'], required: 1, sort: 6 },
      { name: 'paper_type', label: 'Материал', type: 'select', options: ['Бумага полуматовая премиум', 'Мелованная глянцевая премиум'], required: 1, sort: 7 },
      { name: 'paper_density', label: 'Плотность', type: 'select', options: ['300', '350'], required: 1, sort: 8 },
      { name: 'lamination', label: 'Ламинирование', type: 'checkbox', required: 0, sort: 9 },
      { name: 'rounded_corners', label: 'Скругление углов', type: 'checkbox', required: 0, sort: 10 },
      { name: 'design_check', label: 'Проверка макета', type: 'checkbox', required: 0, sort: 11 },
      { name: 'urgency', label: 'Срок и условия', type: 'select', options: ['online', 'urgent', 'promo'], required: 1, sort: 12 }
    ];
    
    for (const param of cardsParams) {
      await runQuery(db, `
        INSERT INTO product_parameters (product_id, name, label, type, options, min_value, max_value, is_required, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [cardsId, param.name, param.label, param.type, param.options ? JSON.stringify(param.options) : null,
          param.min || null, param.max || null, param.required, param.sort]);
    }
    console.log(`Визитки созданы (ID: ${cardsId}, параметров: ${cardsParams.length})\n`);
    
    // =============================================
    // 3. ПЕЧАТЬ ДОКУМЕНТОВ
    // =============================================
    console.log('Создание продукта: Печать документов...');
    const docsId = await runQuery(db, `
      INSERT INTO products (name, description, category_id, icon, calculator_type, product_type, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, ['Печать и переплет документов', 'Печать многостраничных документов с переплетом', categoryId || 1, '', 'product', 'multi_page', 1]);
    
    const docsParams = [
      { name: 'pages', label: 'Количество страниц в файле', type: 'number', min: 1, max: 1000, required: 1, sort: 1 },
      { name: 'quantity', label: 'Количество экземпляров', type: 'number', min: 1, max: 1000, required: 1, sort: 2 },
      { name: 'format', label: 'Формат', type: 'select', options: ['A5 (148x210)', 'A4 (210x297)', 'A3 (297x420)', 'A3 SR (320x450)'], required: 1, sort: 3 },
      { name: 'print_type', label: 'Тип печати', type: 'select', options: ['Лазерная цветная профессиональная', 'Лазерная черно-белая', 'Лазерная черно-белая профессиональная'], required: 1, sort: 4 },
      { name: 'binding_type', label: 'Тип переплета', type: 'select', options: ['Без переплета', 'На пружину пластик', 'На пружину металл', 'Твердый', 'Мягкий', 'На скобу'], required: 1, sort: 5 },
      { name: 'paper_type', label: 'Материал', type: 'select', options: ['Бумага офисная премиум', 'Бумага полуматовая премиум', 'Мелованная глянцевая премиум'], required: 1, sort: 6 },
      { name: 'paper_density', label: 'Плотность', type: 'select', options: ['80', '100', '120', '160'], required: 1, sort: 7 },
      { name: 'trim_margins', label: 'Обрезать поля', type: 'checkbox', required: 0, sort: 8 },
      { name: 'duplex_printing', label: 'Двухсторонняя печать', type: 'checkbox', required: 0, sort: 9 },
      { name: 'design_check', label: 'Проверка макета', type: 'checkbox', required: 0, sort: 10 },
      { name: 'urgency', label: 'Срок и условия', type: 'select', options: ['online', 'urgent', 'promo'], required: 1, sort: 11 }
    ];
    
    for (const param of docsParams) {
      await runQuery(db, `
        INSERT INTO product_parameters (product_id, name, label, type, options, min_value, max_value, is_required, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [docsId, param.name, param.label, param.type, param.options ? JSON.stringify(param.options) : null,
          param.min || null, param.max || null, param.required, param.sort]);
    }
    console.log(`Печать документов создана (ID: ${docsId}, параметров: ${docsParams.length})\n`);
    
    // =============================================
    // 4. БРОШЮРЫ
    // =============================================
    console.log('Создание продукта: Брошюры...');
    const brochuresId = await runQuery(db, `
      INSERT INTO products (name, description, category_id, icon, calculator_type, product_type, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, ['Брошюры', 'Цветные брошюры с различными вариантами переплета', categoryId || 1, '', 'product', 'multi_page_item', 1]);
    
    const brochuresParams = [
      { name: 'pages', label: 'Количество страниц', type: 'number', min: 4, max: 500, required: 1, sort: 1 },
      { name: 'quantity', label: 'Тираж', type: 'number', min: 50, max: 100000, required: 1, sort: 2 },
      { name: 'format', label: 'Формат', type: 'select', options: ['A6', 'A5', 'A4', 'A3'], required: 1, sort: 3 },
      { name: 'cover_type', label: 'Обложка', type: 'select', options: ['Самокладка (из блока)', 'Отдельная цветная', 'Отдельная с ламинацией'], required: 1, sort: 4 },
      { name: 'block_print_type', label: 'Печать блока', type: 'select', options: ['Цветная', 'Черно-белая', 'Смешанная'], required: 1, sort: 5 },
      { name: 'block_paper_type', label: 'Бумага блока', type: 'select', options: ['Офсетная 80 г/м²', 'Мелованная глянцевая 115 г/м²', 'Мелованная матовая 130 г/м²'], required: 1, sort: 6 },
      { name: 'binding_type', label: 'Переплет', type: 'select', options: ['На скобу', 'На пружину', 'КБС (клеевое бесшовное)', 'Швейно-клеевой'], required: 1, sort: 7 },
      { name: 'cover_lamination', label: 'Ламинация обложки', type: 'select', options: ['Нет', 'Матовая', 'Глянцевая', 'Soft-touch'], required: 0, sort: 8 },
      { name: 'urgency', label: 'Срочность', type: 'select', options: ['standard', 'urgent', 'express'], required: 1, sort: 9 }
    ];
    
    for (const param of brochuresParams) {
      await runQuery(db, `
        INSERT INTO product_parameters (product_id, name, label, type, options, min_value, max_value, is_required, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [brochuresId, param.name, param.label, param.type, param.options ? JSON.stringify(param.options) : null,
          param.min || null, param.max || null, param.required, param.sort]);
    }
    console.log(`Брошюры созданы (ID: ${brochuresId}, параметров: ${brochuresParams.length})\n`);
    
    // Итоговая статистика
    console.log('=' .repeat(50));
    console.log('ВСЕ ШАБЛОНЫ ПРОДУКТОВ СОЗДАНЫ УСПЕШНО!');
    console.log('=' .repeat(50));
    console.log(`
 Создано продуктов: 4
  - Листовки (ID: ${flyersId})
  - Визитки (ID: ${cardsId})
  - Печать документов (ID: ${docsId})
  - Брошюры (ID: ${brochuresId})

 Всего параметров: ${flyersParams.length + cardsParams.length + docsParams.length + brochuresParams.length}

 Следующие шаги:
  1. Связать продукты с материалами (product_materials)
  2. Добавить операции к продуктам (product_operations_link)
  3. Настроить ценообразование (price_rules)
  4. Протестировать в калькуляторе!
    `);
    
  } catch (error) {
    console.error('Ошибка при создании продуктов:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Запускаем
if (require.main === module) {
  seedProducts()
    .then(() => {
      console.log('\n Готово! Можно тестировать калькулятор!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n Ошибка:', err);
      process.exit(1);
    });
}

module.exports = { seedProducts };

