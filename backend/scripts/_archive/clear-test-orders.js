#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Путь к базе данных
const DB_FILE = path.resolve(__dirname, '../data.db');

async function clearTestOrders() {
  const db = new sqlite3.Database(DB_FILE);
  
  try {
    console.log('🧹 Очистка тестовых заказов...');
    
    // Удаляем тестовые заказы с сайта (по номеру заказа)
    const result1 = await new Promise((resolve, reject) => {
      db.run(`
        DELETE FROM orders 
        WHERE number LIKE 'site-ord-%' 
        AND customerName IN (
          'Иван Петров', 'Мария Сидорова', 'Алексей Козлов', 'Елена Волкова', 
          'Дмитрий Морозов', 'Анна Соколова', 'Сергей Лебедев', 'Ольга Новикова', 
          'Павел Орлов', 'Татьяна Медведева'
        )
      `, function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    
    // Удаляем тестовые заказы фото (по имени)
    const result2 = await new Promise((resolve, reject) => {
      db.run(`
        DELETE FROM photo_orders 
        WHERE first_name IN ('Иван', 'Мария', 'Алексей', 'Елена', 'Дмитрий')
        AND username IN ('ivan_photo', 'maria_photo', 'alex_photo', 'elena_photo', 'dmitry_photo')
      `, function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    
    console.log(`✅ Удалено заказов с сайта: ${result1}`);
    console.log(`✅ Удалено заказов фото: ${result2}`);
    console.log('🎉 Очистка завершена!');
    
  } catch (error) {
    console.error('❌ Ошибка при очистке тестовых заказов:', error);
  } finally {
    db.close();
  }
}

// Запускаем скрипт
clearTestOrders();
