/**
 * ПРОВЕРКА СОЗДАННЫХ ПРОДУКТОВ
 */

const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('./db-config');

console.log(`БД: ${DB_PATH}\n`);

const db = new sqlite3.Database(DB_PATH);

// Проверяем категории
db.all('SELECT * FROM product_categories', (err, categories) => {
  if (err) {
    console.error('Ошибка чтения категорий:', err.message);
    return;
  }
  
  console.log(`Категории (${categories.length}):`);
  categories.forEach(c => {
    console.log(` ID: ${c.id}, Название: ${c.name}, Активна: ${c.is_active ? '' : ''}`);
  });
  console.log('');
  
  // Проверяем продукты
  db.all('SELECT * FROM products', (err, products) => {
    if (err) {
      console.error('Ошибка чтения продуктов:', err.message);
      db.close();
      return;
    }
    
    console.log(`Продукты (${products.length}):`);
    products.forEach(p => {
      console.log(` ID: ${p.id}, Название: ${p.name}, Категория: ${p.category_id}, Активен: ${p.is_active ? '' : ''}`);
    });
    console.log('');
    
    // Проверяем параметры
    db.all('SELECT product_id, COUNT(*) as count FROM product_parameters GROUP BY product_id', (err, params) => {
      if (err) {
        console.error('Ошибка чтения параметров:', err.message);
      } else {
        console.log(`Параметры по продуктам:`);
        params.forEach(p => {
          const product = products.find(pr => pr.id === p.product_id);
          console.log(`  ${product?.name || 'ID ' + p.product_id}: ${p.count} параметров`);
        });
        console.log('');
      }
      
      // Проверяем query который использует API
      db.all(`
        SELECT p.*, pc.name as category_name, pc.icon as category_icon
        FROM products p
        JOIN product_categories pc ON p.category_id = pc.id
        WHERE p.is_active = 1 AND pc.is_active = 1
        ORDER BY pc.sort_order, p.name
      `, (err, apiProducts) => {
        if (err) {
          console.error('Ошибка API query:', err.message);
        } else {
          console.log(`API вернет продуктов: ${apiProducts.length}`);
          if (apiProducts.length === 0) {
            console.log('\n  ПРОБЛЕМА: API не вернет ни одного продукта!');
            console.log('Причины:');
            console.log('  - Продукты неактивны (is_active = 0)');
            console.log('  - Категория неактивна (is_active = 0)');
            console.log('  - Нет связи между products и product_categories\n');
          } else {
            console.log('API работает корректно!\n');
            apiProducts.forEach(p => {
              console.log(`  - ${p.name} (${p.category_name})`);
            });
          }
        }
        
        db.close();
      });
    });
  });
});

