/**
 * ПОЛНЫЙ АНАЛИЗ ВСЕХ БД
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const databases = [
  { path: 'D:\\CRM\\data.db', name: 'ROOT data.db' },
  { path: 'D:\\CRM\\backend\\data.db', name: 'BACKEND data.db' },
  { path: 'D:\\CRM\\backend\\database.db', name: 'BACKEND database.db' },
];

async function analyzeDB(dbPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(dbPath)) {
      resolve({ exists: false });
      return;
    }
    
    const db = new sqlite3.Database(dbPath);
    const stats = fs.statSync(dbPath);
    const result = {
      exists: true,
      size: (stats.size / 1024).toFixed(2) + ' KB',
      modified: stats.mtime.toLocaleString(),
      tables: {},
      data: {}
    };
    
    // Проверяем основные таблицы
    const checks = [
      { table: 'products', query: 'SELECT COUNT(*) as count FROM products' },
      { table: 'product_categories', query: 'SELECT COUNT(*) as count FROM product_categories' },
      { table: 'product_parameters', query: 'SELECT COUNT(*) as count FROM product_parameters' },
      { table: 'orders', query: 'SELECT COUNT(*) as count FROM orders' },
      { table: 'materials', query: 'SELECT COUNT(*) as count FROM materials' },
      { table: 'post_processing_services', query: 'SELECT COUNT(*) as count FROM post_processing_services' },
    ];
    
    let completed = 0;
    
    checks.forEach(check => {
      db.get(check.query, (err, row) => {
        if (err) {
          result.tables[check.table] = 'НЕТ';
        } else {
          result.tables[check.table] = row.count;
          result.data[check.table] = row.count;
        }
        
        completed++;
        if (completed === checks.length) {
          db.close();
          resolve(result);
        }
      });
    });
  });
}

(async () => {
  console.log('🔍 АНАЛИЗ ВСЕХ БД В ПРОЕКТЕ\n');
  console.log('='.repeat(70));
  
  for (const dbInfo of databases) {
    const analysis = await analyzeDB(dbInfo.path);
    
    console.log(`\n📂 ${dbInfo.name}`);
    console.log(`   Путь: ${dbInfo.path}`);
    
    if (!analysis.exists) {
      console.log('   ❌ НЕ СУЩЕСТВУЕТ');
      continue;
    }
    
    console.log(`   💾 Размер: ${analysis.size}`);
    console.log(`   📅 Изменен: ${analysis.modified}`);
    console.log('   📊 Данные:');
    
    Object.entries(analysis.tables).forEach(([table, count]) => {
      if (count === 'НЕТ') {
        console.log(`      ❌ ${table}: таблица отсутствует`);
      } else if (count === 0) {
        console.log(`      ⚪ ${table}: 0 записей`);
      } else {
        console.log(`      ✅ ${table}: ${count} записей`);
      }
    });
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('💡 РЕКОМЕНДАЦИЯ:');
  console.log('='.repeat(70));
  console.log('\nОставьте ТОЛЬКО одну БД - backend/data.db (самая большая)');
  console.log('\nУдалите лишние:');
  console.log('  - D:\\CRM\\data.db (корневая, 48 KB)');
  console.log('  - D:\\CRM\\backend\\database.db (старая, 32 KB)');
  console.log('\nЗатем настройте backend чтобы всегда использовал:');
  console.log('  backend/data.db\n');
})();

