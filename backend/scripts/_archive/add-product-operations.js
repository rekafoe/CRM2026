/**
 * СКРИПТ ДЛЯ ДОБАВЛЕНИЯ СВЯЗЕЙ ПРОДУКТ-ОПЕРАЦИИ
 * 
 * Добавляет связи между продуктами и операциями в таблицу product_operations_link:
 * - Базовые операции для каждого продукта
 * - Последовательность выполнения операций
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
  console.log('✅ Подключение к базе данных установлено');
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

// Основная функция добавления связей
async function addProductOperations() {
  try {
    console.log('🔗 Добавляем связи продукт-операции...');

    // Получаем все продукты
    const products = await getQuery('SELECT id, name FROM products WHERE is_active = 1');
    console.log(`📦 Найдено продуктов: ${products.length}`);

    // Получаем все услуги
    const services = await getQuery('SELECT id, service_name FROM service_prices WHERE is_active = 1');
    console.log(`🛠️ Найдено услуг: ${services.length}`);

    // Создаем карту услуг по названию
    const serviceMap = {};
    services.forEach(service => {
      serviceMap[service.service_name] = service.id;
    });

    // Базовые операции для каждого продукта
    const baseOperations = [
      { name: 'Печать цифровая', sequence: 1, isRequired: true, isDefault: true },
      { name: 'Резка', sequence: 2, isRequired: true, isDefault: true },
      { name: 'Упаковка', sequence: 10, isRequired: true, isDefault: true }
    ];

    // Дополнительные операции для разных типов продуктов
    const productSpecificOperations = {
      'Листовки': [
        { name: 'Фальцовка', sequence: 3, isRequired: false, isDefault: false }
      ],
      'Буклеты': [
        { name: 'Фальцовка', sequence: 3, isRequired: true, isDefault: true },
        { name: 'Биговка', sequence: 4, isRequired: true, isDefault: true }
      ],
      'Визитки стандартные': [
        { name: 'Скругление углов', sequence: 3, isRequired: false, isDefault: false }
      ],
      'Визитки премиум': [
        { name: 'Скругление углов', sequence: 3, isRequired: true, isDefault: true }
      ],
      'Наклейки': [
        { name: 'Резка', sequence: 2, isRequired: true, isDefault: true }
      ],
      'Баннеры': [
        { name: 'Печать широкоформатная', sequence: 1, isRequired: true, isDefault: true },
        { name: 'Резка', sequence: 2, isRequired: true, isDefault: true }
      ]
    };

    let totalLinks = 0;

    for (const product of products) {
      console.log(`\n📄 Обрабатываем продукт: ${product.name}`);

      // Добавляем базовые операции
      for (const operation of baseOperations) {
        const serviceId = serviceMap[operation.name];
        if (serviceId) {
          await runQuery(`
            INSERT OR REPLACE INTO product_operations_link 
            (product_id, operation_id, sort_order, is_required, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
          `, [product.id, serviceId, operation.sequence, operation.isRequired ? 1 : 0]);
          
          console.log(`  ✅ Добавлена базовая операция: ${operation.name}`);
          totalLinks++;
        } else {
          console.log(`  ⚠️ Услуга не найдена: ${operation.name}`);
        }
      }

      // Добавляем специфичные операции
      const specificOps = productSpecificOperations[product.name] || [];
      for (const operation of specificOps) {
        const serviceId = serviceMap[operation.name];
        if (serviceId) {
          await runQuery(`
            INSERT OR REPLACE INTO product_operations_link 
            (product_id, operation_id, sort_order, is_required, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
          `, [product.id, serviceId, operation.sequence, operation.isRequired ? 1 : 0]);
          
          console.log(`  ✅ Добавлена специфичная операция: ${operation.name}`);
          totalLinks++;
        } else {
          console.log(`  ⚠️ Услуга не найдена: ${operation.name}`);
        }
      }
    }

    console.log(`\n🎉 Связи продукт-операции добавлены успешно!`);
    console.log(`📊 Всего создано связей: ${totalLinks}`);

    // Выводим статистику
    const linkCount = await getQuery('SELECT COUNT(*) as count FROM product_operations_link');
    console.log(`📊 Всего связей в базе: ${linkCount[0].count}`);

  } catch (error) {
    console.error('❌ Ошибка добавления связей:', error);
    process.exit(1);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Ошибка закрытия базы данных:', err.message);
      } else {
        console.log('✅ Соединение с базой данных закрыто');
      }
    });
  }
}

// Запускаем добавление связей
addProductOperations();
