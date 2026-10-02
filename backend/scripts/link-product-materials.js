/**
 * СВЯЗЫВАНИЕ ПРОДУКТОВ С МАТЕРИАЛАМИ
 * 
 * Скрипт связывает созданные продукты с материалами из склада
 * Использование: node backend/scripts/link-product-materials.js
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

async function getRow(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function linkMaterials() {
  const db = new sqlite3.Database(DB_PATH);
  
  console.log('Начинаем связывание продуктов с материалами...\n');
  
  try {
    // Создаем таблицу product_materials если её нет
    console.log('Создание таблицы product_materials...');
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS product_materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        material_id INTEGER NOT NULL,
        is_required INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE CASCADE,
        UNIQUE(product_id, material_id)
      )
    `);
    console.log('Таблица product_materials готова\n');
    
    // Получаем список продуктов
    const products = await getAllRows(db, 'SELECT id, name FROM products ORDER BY id');
    console.log(`Найдено продуктов: ${products.length}`);
    
    if (products.length === 0) {
      console.log(' Продукты не найдены! Запустите сначала seed-product-templates.js');
      return;
    }
    
    // Проверяем наличие таблицы materials
    let materials = [];
    try {
      materials = await getAllRows(db, `
        SELECT id, name, category_name, sheet_price_single as price 
        FROM materials 
        WHERE is_active = 1
        ORDER BY category_name, name
      `);
    } catch (error) {
      console.log(' Таблица materials не найдена в БД.');
      console.log('Материалы можно добавить позже через админ-панель.');
      console.log('Продукты созданы и готовы к использованию!\n');
      return;
    }
    
    console.log(`Найдено материалов: ${materials.length}`);
    
    if (materials.length === 0) {
      console.log(' Материалы не найдены! Добавьте материалы через админ-панель.');
      console.log('Продукты созданы и готовы к использованию!\n');
      return;
    }
    
    console.log('\n Доступные материалы:');
    const materialsByCategory = {};
    materials.forEach(m => {
      const cat = m.category_name || 'Без категории';
      if (!materialsByCategory[cat]) materialsByCategory[cat] = [];
      materialsByCategory[cat].push(m);
    });
    
    Object.entries(materialsByCategory).forEach(([cat, mats]) => {
      console.log(`\n  ${cat}:`);
      mats.forEach(m => console.log(`    - ${m.name} (ID: ${m.id}, ${m.price} BYN)`));
    });
    
    console.log('\n Связывание материалов с продуктами...\n');
    
    // Связываем каждый продукт
    for (const product of products) {
      console.log(`\n Продукт: ${product.name} (ID: ${product.id})`);
      
      let linkedCount = 0;
      
      switch (product.name) {
        case 'Листовки':
          // Листовки - мелованная, офсетная бумага
          const flyerMaterials = materials.filter(m => 
            m.name.toLowerCase().includes('мелован') || 
            m.name.toLowerCase().includes('офсет') ||
            m.name.toLowerCase().includes('глянцев')
          );
          
          for (const material of flyerMaterials.slice(0, 5)) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_materials (product_id, material_id, is_required)
                VALUES (?, ?, ?)
              `, [product.id, material.id, linkedCount === 0 ? 1 : 0]);
              console.log(`  ${material.name} ${linkedCount === 0 ? '(обязательный)' : ''}`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${material.name} - уже связан`);
            }
          }
          break;
          
        case 'Визитки':
          // Визитки - плотная мелованная, дизайнерская
          const cardMaterials = materials.filter(m => 
            m.name.toLowerCase().includes('мелован') || 
            m.name.toLowerCase().includes('дизайнер') ||
            (m.name.toLowerCase().includes('бумага') && !m.name.toLowerCase().includes('офсет'))
          );
          
          for (const material of cardMaterials.slice(0, 5)) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_materials (product_id, material_id, is_required)
                VALUES (?, ?, ?)
              `, [product.id, material.id, linkedCount === 0 ? 1 : 0]);
              console.log(`  ${material.name} ${linkedCount === 0 ? '(обязательный)' : ''}`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${material.name} - уже связан`);
            }
          }
          break;
          
        case 'Печать и переплет документов':
          // Документы - офисная, офсетная бумага
          const docMaterials = materials.filter(m => 
            m.name.toLowerCase().includes('офис') || 
            m.name.toLowerCase().includes('офсет') ||
            m.name.toLowerCase().includes('80') ||
            m.name.toLowerCase().includes('для печати')
          );
          
          for (const material of docMaterials.slice(0, 5)) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_materials (product_id, material_id, is_required)
                VALUES (?, ?, ?)
              `, [product.id, material.id, linkedCount === 0 ? 1 : 0]);
              console.log(`  ${material.name} ${linkedCount === 0 ? '(обязательный)' : ''}`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${material.name} - уже связан`);
            }
          }
          break;
          
        case 'Брошюры':
          // Брошюры - мелованная для обложки, офсетная для блока
          const brochureMaterials = materials.filter(m => 
            m.name.toLowerCase().includes('мелован') || 
            m.name.toLowerCase().includes('офсет') ||
            m.name.toLowerCase().includes('глянцев')
          );
          
          for (const material of brochureMaterials.slice(0, 5)) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_materials (product_id, material_id, is_required)
                VALUES (?, ?, ?)
              `, [product.id, material.id, linkedCount === 0 ? 1 : 0]);
              console.log(`  ${material.name} ${linkedCount === 0 ? '(обязательный)' : ''}`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${material.name} - уже связан`);
            }
          }
          break;
          
        default:
          // Для остальных - первые 3 материала
          for (const material of materials.slice(0, 3)) {
            try {
              await runQuery(db, `
                INSERT OR IGNORE INTO product_materials (product_id, material_id, is_required)
                VALUES (?, ?, ?)
              `, [product.id, material.id, linkedCount === 0 ? 1 : 0]);
              console.log(`  ${material.name} ${linkedCount === 0 ? '(обязательный)' : ''}`);
              linkedCount++;
            } catch (e) {
              console.log(`   ${material.name} - уже связан`);
            }
          }
      }
      
      if (linkedCount === 0) {
        console.log(`   Не удалось связать ни одного материала`);
      } else {
        console.log(`  Связано материалов: ${linkedCount}`);
      }
    }
    
    // Итоговая статистика
    const stats = await getAllRows(db, `
      SELECT 
        p.name as product_name,
        COUNT(pm.id) as materials_count,
        SUM(CASE WHEN pm.is_required = 1 THEN 1 ELSE 0 END) as required_count
      FROM products p
      LEFT JOIN product_materials pm ON pm.product_id = p.id
      GROUP BY p.id, p.name
      ORDER BY p.id
    `);
    
    console.log('\n' + '='.repeat(60));
    console.log('СВЯЗЫВАНИЕ ЗАВЕРШЕНО!');
    console.log('='.repeat(60));
    console.log('\n Статистика:\n');
    
    stats.forEach(s => {
      console.log(`  ${s.product_name}:`);
      console.log(`    - Всего материалов: ${s.materials_count}`);
      console.log(`    - Обязательных: ${s.required_count}`);
    });
    
    console.log('\n Следующие шаги:');
    console.log('  1. Добавьте операции к продуктам');
    console.log('  2. Протестируйте продукты в калькуляторе');
    console.log('  3. Настройте ценообразование\n');
    
  } catch (error) {
    console.error('Ошибка:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Запускаем
if (require.main === module) {
  linkMaterials()
    .then(() => {
      console.log('Готово!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n Ошибка:', err);
      process.exit(1);
    });
}

module.exports = { linkMaterials };

