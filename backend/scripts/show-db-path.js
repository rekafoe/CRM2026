/**
 * ПОКАЗАТЬ ПУТЬ К БД который использует backend
 */

const path = require('path');
const fs = require('fs');

// Копируем логику из backend/src/db.ts
function resolveDatabasePath() {
  const candidates = [
    process.env.DB_FILE ? path.resolve(process.cwd(), process.env.DB_FILE) : null,
    path.resolve(process.cwd(), 'data.db'),
    path.resolve(process.cwd(), 'backend/data.db'),
    path.resolve(process.cwd(), 'backend/src/data.db'),
    path.resolve(__dirname, '../data.db'),
    path.resolve(__dirname, '../../data.db'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`✅ Найден: ${candidate}`);
      return candidate;
    }
    const dir = path.dirname(candidate);
    if (fs.existsSync(dir)) {
      console.log(`📁 Директория существует, но файл нет: ${candidate}`);
    } else {
      console.log(`❌ Не существует: ${candidate}`);
    }
  }

  return path.resolve(process.cwd(), 'data.db');
}

console.log('🔍 Проверка путей к БД...\n');
console.log('Рабочая директория:', process.cwd());
console.log('Скрипт находится:', __dirname);
console.log('');

const dbPath = resolveDatabasePath();

console.log('\n📂 BACKEND БУДЕТ ИСПОЛЬЗОВАТЬ:');
console.log(`   ${dbPath}`);
console.log('');

// Проверяем размер файла
try {
  const stats = fs.statSync(dbPath);
  console.log(`📊 Размер файла: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`📅 Изменен: ${stats.mtime.toLocaleString()}`);
} catch (e) {
  console.log('⚠️  Файл еще не создан (будет создан при первом запуске backend)');
}

console.log('\n🎯 Для проверки продуктов в этой БД:');
console.log(`   node backend/scripts/check-products.js`);

