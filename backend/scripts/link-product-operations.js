/**
 * СВЯЗЫВАНИЕ ПРОДУКТОВ С ОПЕРАЦИЯМИ
 * 
 * Скрипт связывает созданные продукты с операциями из post_processing_services
 * Использование: node backend/scripts/link-product-operations.js
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

async function getAllRows(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function linkOperations() {
  const db = new sqlite3.Database(DB_PATH);
  
  console.log(' Начинаем связывание продуктов с операциями...\n');
  
  try {
    // Создаем таблицу product_operations_link если её нет
    console.log('Создание таблицы product_operations_link...');
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS product_operations_link (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        operation_id INTEGER NOT NULL,
        sequence INTEGER NOT NULL DEFAULT 1,
        is_required INTEGER DEFAULT 1,
        is_default INTEGER DEFAULT 1,
        price_multiplier REAL DEFAULT 1.0,
        default_params TEXT,
        conditions TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY(operation_id) REFERENCES post_processing_services(id) ON DELETE CASCADE,
        UNIQUE(product_id, operation_id)
      )
    `);
    console.log('Таблица product_operations_link готова\n');
    
    // Получаем список продуктов
    const products = await getAllRows(db, 'SELECT id, name FROM products ORDER BY id');
    console.log(`Найдено продуктов: ${products.length}`);
    
    if (products.length === 0) {
      console.log(' Продукты не найдены! Запустите сначала seed-product-templates.js');
      return;
    }
    
    // Проверяем наличие операций
    let operations = [];
    try {
      operations = await getAllRows(db, `
        SELECT id, name, operation_type, unit, price as price_per_unit
        FROM post_processing_services 
        WHERE is_active = 1
        ORDER BY operation_type, name
      `);
    } catch (error) {
      console.log(' Таблица post_processing_services не найдена.');
      console.log('Операции можно добавить позже через админ-панель.');
      console.log('Продукты созданы и готовы к использованию!\n');
      return;
    }
    
    console.log(` Найдено операций: ${operations.length}`);
    
    if (operations.length === 0) {
      console.log(' Операции не найдены! Добавьте операции через админ-панель.');
      console.log('Минимально нужны: Печать и Резка');
      console.log('Продукты созданы и готовы к использованию!\n');
      return;
    }
    
    console.log('\n Доступные операции:');
    const operationsByType = {};
    operations.forEach(op => {
      const type = op.operation_type || 'Общие';
      if (!operationsByType[type]) operationsByType[type] = [];
      operationsByType[type].push(op);
    });
    
    Object.entries(operationsByType).forEach(([type, ops]) => {
      console.log(`\n  ${type}:`);
      ops.forEach(op => console.log(`    - ${op.name} (ID: ${op.id}, ${op.price_per_unit} ${op.unit})`));
    });
    
    console.log('\n Связывание операций с продуктами...\n');
    
    // Ищем основные операции
    const printOp = operations.find(op => 
      op.name.toLowerCase().includes('печат') || 
      op.operation_type === 'printing'
    );
    const cutOp = operations.find(op => 
      op.name.toLowerCase().includes('резка') || 
      op.name.toLowerCase().includes('гильотин') ||
      op.operation_type === 'cutting'
    );
    const laminateOp = operations.find(op => 
      op.name.toLowerCase().includes('ламин') ||
      op.operation_type === 'lamination'
    );
    const bindingOp = operations.find(op => 
      op.name.toLowerCase().includes('переплет') ||
      op.name.toLowerCase().includes('брошюр') ||
      op.operation_type === 'binding'
    );
    
    // Связываем каждый продукт
    for (const product of products) {
      console.log(`\n Продукт: ${product.name} (ID: ${product.id})`);
      
      let linkedCount = 0;
      let sequence = 1;
      
      switch (product.name) {
        case 'Листовки':
          // Листовки: Печать + Резка
          if (printOp) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_operations_link 
                (product_id, operation_id, sequence, is_required, is_default, price_multiplier)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [product.id, printOp.id, sequence++, 1, 1, 1.0]);
              console.log(`  ${printOp.name} (обязательная)`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${printOp.name} - уже связана`);
            }
          }
          
          if (cutOp) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_operations_link 
                (product_id, operation_id, sequence, is_required, is_default, price_multiplier)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [product.id, cutOp.id, sequence++, 1, 1, 1.0]);
              console.log(`  ${cutOp.name} (обязательная)`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${cutOp.name} - уже связана`);
            }
          }
          
          if (laminateOp) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_operations_link 
                (product_id, operation_id, sequence, is_required, is_default, price_multiplier)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [product.id, laminateOp.id, sequence++, 0, 0, 1.0]);
              console.log(`  ${laminateOp.name} (опциональная)`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${laminateOp.name} - уже связана`);
            }
          }
          break;
          
        case 'Визитки':
          // Визитки: Печать + Резка + Ламинация (опц)
          if (printOp) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_operations_link 
                (product_id, operation_id, sequence, is_required, is_default, price_multiplier)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [product.id, printOp.id, sequence++, 1, 1, 1.0]);
              console.log(`  ${printOp.name} (обязательная)`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${printOp.name} - уже связана`);
            }
          }
          
          if (cutOp) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_operations_link 
                (product_id, operation_id, sequence, is_required, is_default, price_multiplier)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [product.id, cutOp.id, sequence++, 1, 1, 1.0]);
              console.log(`  ${cutOp.name} (обязательная)`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${cutOp.name} - уже связана`);
            }
          }
          
          if (laminateOp) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_operations_link 
                (product_id, operation_id, sequence, is_required, is_default, price_multiplier)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [product.id, laminateOp.id, sequence++, 0, 0, 1.0]);
              console.log(`  ${laminateOp.name} (опциональная)`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${laminateOp.name} - уже связана`);
            }
          }
          break;
          
        case 'Печать и переплет документов':
          // Документы: Печать + Переплет
          if (printOp) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_operations_link 
                (product_id, operation_id, sequence, is_required, is_default, price_multiplier)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [product.id, printOp.id, sequence++, 1, 1, 1.0]);
              console.log(`  ${printOp.name} (обязательная)`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${printOp.name} - уже связана`);
            }
          }
          
          if (bindingOp) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_operations_link 
                (product_id, operation_id, sequence, is_required, is_default, price_multiplier)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [product.id, bindingOp.id, sequence++, 0, 0, 1.0]);
              console.log(`  ${bindingOp.name} (опциональная)`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${bindingOp.name} - уже связана`);
            }
          }
          break;
          
        case 'Брошюры':
          // Брошюры: Печать + Резка + Переплет (обязательно)
          if (printOp) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_operations_link 
                (product_id, operation_id, sequence, is_required, is_default, price_multiplier)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [product.id, printOp.id, sequence++, 1, 1, 1.0]);
              console.log(`  ${printOp.name} (обязательная)`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${printOp.name} - уже связана`);
            }
          }
          
          if (cutOp) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_operations_link 
                (product_id, operation_id, sequence, is_required, is_default, price_multiplier)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [product.id, cutOp.id, sequence++, 1, 1, 1.0]);
              console.log(`  ${cutOp.name} (обязательная)`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${cutOp.name} - уже связана`);
            }
          }
          
          if (bindingOp) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_operations_link 
                (product_id, operation_id, sequence, is_required, is_default, price_multiplier)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [product.id, bindingOp.id, sequence++, 1, 1, 1.0]);
              console.log(`  ${bindingOp.name} (обязательная)`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${bindingOp.name} - уже связана`);
            }
          }
          
          if (laminateOp) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_operations_link 
                (product_id, operation_id, sequence, is_required, is_default, price_multiplier)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [product.id, laminateOp.id, sequence++, 0, 0, 1.0]);
              console.log(`  ${laminateOp.name} (опциональная)`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${laminateOp.name} - уже связана`);
            }
          }
          break;
          
        default:
          // Для остальных - минимум Печать
          if (printOp) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_operations_link 
                (product_id, operation_id, sequence, is_required, is_default, price_multiplier)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [product.id, printOp.id, sequence++, 1, 1, 1.0]);
              console.log(`  ${printOp.name} (обязательная)`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${printOp.name} - уже связана`);
            }
          }
      }
      
      if (linkedCount === 0) {
        console.log(`   Не удалось связать ни одной операции`);
      } else {
        console.log(`  Связано операций: ${linkedCount}`);
      }
    }
    
    // Итоговая статистика
    const stats = await getAllRows(db, `
      SELECT 
        p.name as product_name,
        COUNT(pol.id) as operations_count,
        SUM(CASE WHEN pol.is_required = 1 THEN 1 ELSE 0 END) as required_count
      FROM products p
      LEFT JOIN product_operations_link pol ON pol.product_id = p.id
      GROUP BY p.id, p.name
      ORDER BY p.id
    `);
    
    console.log('\n' + '='.repeat(60));
    console.log('СВЯЗЫВАНИЕ ОПЕРАЦИЙ ЗАВЕРШЕНО!');
    console.log('='.repeat(60));
    console.log('\n Статистика:\n');
    
    stats.forEach(s => {
      console.log(`  ${s.product_name}:`);
      console.log(`    - Всего операций: ${s.operations_count}`);
      console.log(`    - Обязательных: ${s.required_count}`);
    });
    
    console.log('\n Следующие шаги:');
    console.log('  1. Откройте админ-панель: http://localhost:5173/adminpanel/products');
    console.log('  2. Проверьте созданные продукты');
    console.log('  3. При необходимости добавьте материалы и операции');
    console.log('  4. Протестируйте в калькуляторе!\n');
    
  } catch (error) {
    console.error('Ошибка:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Запускаем
if (require.main === module) {
  linkOperations()
    .then(() => {
      console.log('Готово!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n Ошибка:', err);
      process.exit(1);
    });
}

module.exports = { linkOperations };

