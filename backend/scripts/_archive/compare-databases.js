/**
 * СРАВНЕНИЕ ВСЕХ БД В ПРОЕКТЕ
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPaths = [
  'D:\\CRM\\data.db',
  'D:\\CRM\\backend\\data.db',
  'D:\\CRM\\backend\\database.db',
  'D:\\CRM\\backend\\src\\data.db',
];

console.log('🔍 Поиск всех БД в проекте...\n');

dbPaths.forEach(dbPath => {
  if (!fs.existsSync(dbPath)) {
    console.log(`❌ ${dbPath} - НЕ СУЩЕСТВУЕТ`);
    return;
  }
  
  console.log(`\n📂 ${dbPath}`);
  console.log('─'.repeat(60));
  
  const db = new sqlite3.Database(dbPath);
  
  // Проверяем продукты
  db.all('SELECT COUNT(*) as count FROM products', (err, result) => {
    if (err) {
      console.log('  ❌ Нет таблицы products');
    } else {
      const count = result[0].count;
      console.log(`  📦 Продуктов: ${count}`);
      
      if (count > 0) {
        db.all('SELECT id, name, category_id, is_active FROM products ORDER BY id', (err, products) => {
          if (!err) {
            products.forEach(p => {
              console.log(`     ${p.is_active ? '✅' : '❌'} ID ${p.id}: ${p.name}`);
            });
          }
        });
      }
    }
  });
  
  // Проверяем категории
  db.all('SELECT COUNT(*) as count FROM product_categories', (err, result) => {
    if (err) {
      console.log('  ❌ Нет таблицы product_categories');
    } else {
      console.log(`  📁 Категорий: ${result[0].count}`);
    }
  });
  
  // Проверяем параметры
  db.all('SELECT COUNT(*) as count FROM product_parameters', (err, result) => {
    if (err) {
      console.log('  ❌ Нет таблицы product_parameters');
    } else {
      console.log(`  📋 Параметров: ${result[0].count}`);
    }
  });
  
  // Размер файла
  const stats = fs.statSync(dbPath);
  console.log(`  💾 Размер: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`  📅 Изменен: ${stats.mtime.toLocaleString()}`);
  
  setTimeout(() => db.close(), 1000);
});

setTimeout(() => {
  console.log('\n\n' + '='.repeat(60));
  console.log('💡 РЕКОМЕНДАЦИЯ:');
  console.log('='.repeat(60));
  console.log('\n1. Найдите в логах backend строку: "📂 Opening database at"');
  console.log('2. Посмотрите какую БД он использует');
  console.log('3. Пересоздайте продукты в ЭТОЙ БД\n');
  console.log('Или установите переменную окружения:');
  console.log('  set DB_FILE=data.db');
  console.log('  npm run dev\n');
}, 2000);

