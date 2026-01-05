/**
 * ПРОВЕРКА СТРУКТУРЫ БД
 */

const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('./db-config');
const fs = require('fs');

console.log('🔍 Проверка структуры БД...\n');
console.log(`📂 БД: ${DB_PATH}`);

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ ОШИБКА: Файл БД не существует!');
  console.log('💡 Backend должен создать БД при первом запуске');
  process.exit(1);
}

const stats = fs.statSync(DB_PATH);
console.log(`💾 Размер: ${(stats.size / 1024).toFixed(2)} KB`);
console.log(`📅 Изменен: ${stats.mtime.toLocaleString()}\n`);

const db = new sqlite3.Database(DB_PATH);

// Получаем список всех таблиц
db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
  if (err) {
    console.error('❌ Ошибка чтения таблиц:', err.message);
    db.close();
    return;
  }
  
  console.log(`📊 Таблиц в БД: ${tables.length}\n`);
  
  const importantTables = [
    'users', 'orders', 'items', 
    'materials', 'material_categories', 'suppliers',
    'products', 'product_categories', 'product_parameters',
    'post_processing_services', 'product_operations_link'
  ];
  
  console.log('Критичные таблицы:');
  importantTables.forEach(tableName => {
    const exists = tables.find(t => t.name === tableName);
    if (exists) {
      console.log(`  ✅ ${tableName}`);
    } else {
      console.log(`  ❌ ${tableName} - ОТСУТСТВУЕТ!`);
    }
  });
  
  console.log('\nВсе таблицы:');
  tables.forEach(t => console.log(`  - ${t.name}`));
  
  db.close();
  
  console.log('\n💡 Если критичные таблицы отсутствуют:');
  console.log('   Backend упадет с ошибкой 500!');
  console.log('   Нужно запустить миграции или восстановить БД\n');
});

