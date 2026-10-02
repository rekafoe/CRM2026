/**
 * СКРИПТ ДЛЯ ДОБАВЛЕНИЯ УСЛУГ ПЕЧАТИ
 * 
 * Добавляет недостающие услуги в таблицу service_prices:
 * - Печать цифровая
 * - Другие базовые услуги
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

// Основная функция добавления услуг
async function addPrintingServices() {
  try {
    console.log('Добавляем услуги печати...');

    // Список услуг для добавления
    const services = [
      {
        service_name: 'Печать цифровая',
        price_per_unit: 0.19,
        unit: 'per_sheet',
        description: 'Цифровая печать на листе'
      },
      {
        service_name: 'Печать офсетная',
        price_per_unit: 0.15,
        unit: 'per_sheet',
        description: 'Офсетная печать на листе'
      },
      {
        service_name: 'Печать широкоформатная',
        price_per_unit: 0.25,
        unit: 'per_sheet',
        description: 'Широкоформатная печать'
      },
      {
        service_name: 'Резка',
        price_per_unit: 0.10,
        unit: 'per_cut',
        description: 'Резка по контуру'
      },
      {
        service_name: 'Фальцовка',
        price_per_unit: 0.20,
        unit: 'per_fold',
        description: 'Фальцовка листов'
      },
      {
        service_name: 'Биговка',
        price_per_unit: 0.15,
        unit: 'per_fold',
        description: 'Биговка для сгибов'
      },
      {
        service_name: 'Перфорация',
        price_per_unit: 0.05,
        unit: 'per_item',
        description: 'Перфорация для отрывных листов'
      },
      {
        service_name: 'Скругление углов',
        price_per_unit: 0.03,
        unit: 'per_item',
        description: 'Скругление углов'
      },
      {
        service_name: 'Нумерация',
        price_per_unit: 0.02,
        unit: 'per_item',
        description: 'Нумерация изделий'
      },
      {
        service_name: 'Упаковка',
        price_per_unit: 0.50,
        unit: 'per_order',
        description: 'Упаковка заказа'
      }
    ];

    for (const service of services) {
      // Проверяем, существует ли уже такая услуга
      const existing = await new Promise((resolve, reject) => {
        db.get(
          'SELECT id FROM service_prices WHERE service_name = ?',
          [service.service_name],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (existing) {
        console.log(`Услуга "${service.service_name}" уже существует`);
        continue;
      }

      // Добавляем услугу
      await runQuery(`
        INSERT INTO service_prices 
        (service_name, price_per_unit, unit, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
      `, [service.service_name, service.price_per_unit, service.unit]);

      console.log(`Добавлена услуга: ${service.service_name} - ${service.price_per_unit} ${service.unit}`);
    }

    console.log('Услуги печати добавлены успешно!');
    
    // Выводим статистику
    const serviceCount = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM service_prices WHERE is_active = 1', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    console.log(`Всего активных услуг: ${serviceCount}`);

  } catch (error) {
    console.error('Ошибка добавления услуг:', error);
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

// Запускаем добавление услуг
addPrintingServices();
