/**
 * СКРИПТ ДЛЯ ЗАПОЛНЕНИЯ БАЗЫ ДАННЫХ ПРОДУКТАМИ
 * 
 * Создает тестовые данные:
 * - Категории продуктов
 * - Продукты по категориям
 * - Параметры продуктов
 * - Послепечатные услуги
 * - Скидки по тиражам
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Путь к базе данных
const dbPath = path.join(__dirname, '..', 'data.db');

// Создаем подключение к базе данных
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Ошибка подключения к базе данных:', err.message);
    process.exit(1);
  }
  console.log('Подключение к базе данных установлено');
});

// Функция для выполнения SQL запроса
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        console.error('Ошибка выполнения запроса:', err.message);
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

// Функция для получения данных
function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Ошибка получения данных:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Основная функция заполнения данными
async function seedProducts() {
  try {
    console.log('Начинаем заполнение базы данных продуктами...');

    // 1. Создаем категории продуктов
    console.log('Создаем категории продуктов...');
    
    const categories = [
      {
        name: 'Печатная продукция',
        icon: '',
        description: 'Листовки, буклеты, каталоги и другая печатная продукция',
        sort_order: 1
      },
      {
        name: 'Визитки',
        icon: '',
        description: 'Визитные карточки различных типов',
        sort_order: 2
      },
      {
        name: 'Наклейки',
        icon: '',
        description: 'Наклейки и стикеры',
        sort_order: 3
      },
      {
        name: 'Баннеры',
        icon: '',
        description: 'Баннеры и растяжки',
        sort_order: 4
      },
      {
        name: 'Брошюры',
        icon: '',
        description: 'Брошюры и каталоги',
        sort_order: 5
      }
    ];

    for (const category of categories) {
      await runQuery(`
        INSERT OR REPLACE INTO product_categories (name, icon, description, sort_order, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `, [category.name, category.icon, category.description, category.sort_order]);
    }

    console.log('Категории созданы');

    // 2. Получаем ID категорий
    const categoryMap = {};
    const categoriesData = await getQuery('SELECT id, name FROM product_categories');
    for (const cat of categoriesData) {
      categoryMap[cat.name] = cat.id;
    }

    // 3. Создаем продукты
    console.log('Создаем продукты...');
    
    const products = [
      // Печатная продукция
      {
        category: 'Печатная продукция',
        name: 'Листовки',
        description: 'Рекламные листовки различных форматов',
        icon: ''
      },
      {
        category: 'Печатная продукция',
        name: 'Буклеты',
        description: 'Информационные буклеты',
        icon: ''
      },
      {
        category: 'Печатная продукция',
        name: 'Каталоги',
        description: 'Каталоги товаров и услуг',
        icon: ''
      },
      
      // Визитки
      {
        category: 'Визитки',
        name: 'Визитки стандартные',
        description: 'Классические визитные карточки',
        icon: ''
      },
      {
        category: 'Визитки',
        name: 'Визитки премиум',
        description: 'Премиальные визитные карточки',
        icon: ''
      },
      {
        category: 'Визитки',
        name: 'Визитки магнитные',
        description: 'Визитки на магнитной основе',
        icon: ''
      },
      
      // Наклейки
      {
        category: 'Наклейки',
        name: 'Наклейки',
        description: 'Самоклеящиеся наклейки',
        icon: ''
      },
      {
        category: 'Наклейки',
        name: 'Стикеры',
        description: 'Декоративные стикеры',
        icon: ''
      },
      
      // Баннеры
      {
        category: 'Баннеры',
        name: 'Баннеры',
        description: 'Рекламные баннеры',
        icon: ''
      },
      {
        category: 'Баннеры',
        name: 'Растяжки',
        description: 'Растяжки для улиц',
        icon: ''
      },
      
      // Брошюры
      {
        category: 'Брошюры',
        name: 'Брошюры',
        description: 'Информационные брошюры',
        icon: ''
      },
      {
        category: 'Брошюры',
        name: 'Каталоги',
        description: 'Каталоги товаров',
        icon: ''
      }
    ];

    for (const product of products) {
      await runQuery(`
        INSERT OR REPLACE INTO products (category_id, name, description, icon, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `, [categoryMap[product.category], product.name, product.description, product.icon]);
    }

    console.log('Продукты созданы');

    // 4. Получаем ID продуктов
    const productMap = {};
    const productsData = await getQuery('SELECT id, name FROM products');
    for (const product of productsData) {
      productMap[product.name] = product.id;
    }

    // 5. Создаем параметры продуктов
    console.log('Создаем параметры продуктов...');
    
    const parameters = [
      // Листовки
      {
        product: 'Листовки',
        name: 'format',
        type: 'select',
        label: 'Формат',
        options: JSON.stringify(['A6', 'A5', 'A4', 'A3']),
        is_required: 1,
        sort_order: 1
      },
      {
        product: 'Листовки',
        name: 'quantity',
        type: 'number',
        label: 'Количество',
        min_value: 100,
        max_value: 10000,
        step: 100,
        default_value: '1000',
        is_required: 1,
        sort_order: 2
      },
      {
        product: 'Листовки',
        name: 'sides',
        type: 'select',
        label: 'Стороны',
        options: JSON.stringify(['1', '2']),
        default_value: '2',
        is_required: 1,
        sort_order: 3
      },
      
      // Визитки
      {
        product: 'Визитки стандартные',
        name: 'quantity',
        type: 'number',
        label: 'Количество',
        min_value: 100,
        max_value: 5000,
        step: 100,
        default_value: '1000',
        is_required: 1,
        sort_order: 1
      },
      {
        product: 'Визитки стандартные',
        name: 'lamination',
        type: 'select',
        label: 'Ламинация',
        options: JSON.stringify(['none', 'matte', 'glossy']),
        default_value: 'none',
        is_required: 0,
        sort_order: 2
      },
      
      // Наклейки
      {
        product: 'Наклейки',
        name: 'quantity',
        type: 'number',
        label: 'Количество',
        min_value: 50,
        max_value: 5000,
        step: 50,
        default_value: '500',
        is_required: 1,
        sort_order: 1
      },
      {
        product: 'Наклейки',
        name: 'cutting',
        type: 'checkbox',
        label: 'Вырубка',
        default_value: 'false',
        is_required: 0,
        sort_order: 2
      }
    ];

    for (const param of parameters) {
      if (productMap[param.product]) {
        await runQuery(`
          INSERT OR REPLACE INTO product_parameters 
          (product_id, name, type, label, options, min_value, max_value, step, default_value, is_required, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
          productMap[param.product],
          param.name,
          param.type,
          param.label,
          param.options || null,
          param.min_value || null,
          param.max_value || null,
          param.step || null,
          param.default_value || null,
          param.is_required,
          param.sort_order
        ]);
      }
    }

    console.log('Параметры продуктов созданы');

    // 6. Создаем послепечатные услуги
    console.log('Создаем послепечатные услуги...');
    
    const services = [
      {
        name: 'Ламинация матовая',
        description: 'Матовая ламинация',
        price: 0.05,
        unit: 'per_sheet',
        operation_type: 'laminate'
      },
      {
        name: 'Ламинация глянцевая',
        description: 'Глянцевая ламинация',
        price: 0.05,
        unit: 'per_sheet',
        operation_type: 'laminate'
      },
      {
        name: 'Вырубка',
        description: 'Вырубка по контуру',
        price: 0.10,
        unit: 'per_item',
        operation_type: 'cut'
      },
      {
        name: 'Перфорация',
        description: 'Перфорация для отрывных листов',
        price: 0.02,
        unit: 'per_item',
        operation_type: 'perforate'
      },
      {
        name: 'Скругление углов',
        description: 'Скругление углов',
        price: 0.01,
        unit: 'per_item',
        operation_type: 'cut'
      }
    ];

    for (const service of services) {
      await runQuery(`
        INSERT OR REPLACE INTO post_processing_services 
        (name, description, price, unit, operation_type, price_unit, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, 'per_item', 1, datetime('now'))
      `, [service.name, service.description, service.price, service.unit, service.operation_type]);
    }

    console.log('Послепечатные услуги созданы');

    // 7. Создаем скидки по тиражам
    console.log('Создаем скидки по тиражам...');
    
    const discounts = [
      { min_quantity: 100, max_quantity: 499, discount_percent: 5 },
      { min_quantity: 500, max_quantity: 999, discount_percent: 10 },
      { min_quantity: 1000, max_quantity: 4999, discount_percent: 15 },
      { min_quantity: 5000, max_quantity: null, discount_percent: 20 }
    ];

    for (const discount of discounts) {
      await runQuery(`
        INSERT OR REPLACE INTO quantity_discounts 
        (min_quantity, max_quantity, discount_percent, is_active, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
      `, [discount.min_quantity, discount.max_quantity, discount.discount_percent]);
    }

    console.log('Скидки по тиражам созданы');

    console.log('Заполнение базы данных продуктами завершено!');
    
    // Выводим статистику
    const categoryCount = await getQuery('SELECT COUNT(*) as count FROM product_categories');
    const productCount = await getQuery('SELECT COUNT(*) as count FROM products');
    const parameterCount = await getQuery('SELECT COUNT(*) as count FROM product_parameters');
    const serviceCount = await getQuery('SELECT COUNT(*) as count FROM post_processing_services');
    const discountCount = await getQuery('SELECT COUNT(*) as count FROM quantity_discounts');
    
    console.log('\n Статистика:');
    console.log(`- Категорий: ${categoryCount[0].count}`);
    console.log(`- Продуктов: ${productCount[0].count}`);
    console.log(`- Параметров: ${parameterCount[0].count}`);
    console.log(`- Услуг: ${serviceCount[0].count}`);
    console.log(`- Скидок: ${discountCount[0].count}`);

  } catch (error) {
    console.error('Ошибка заполнения базы данных:', error);
    process.exit(1);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Ошибка закрытия базы данных:', err.message);
      } else {
        console.log('Соединение с базой данных закрыто');
      }
    });
  }
}

// Запускаем заполнение
seedProducts();
