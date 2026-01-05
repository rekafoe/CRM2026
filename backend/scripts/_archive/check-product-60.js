/**
 * Скрипт для проверки продукта ID 60
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Ошибка подключения к БД:', err);
    process.exit(1);
  }
});

console.log('='.repeat(80));
console.log('🔍 ПРОВЕРКА ПРОДУКТА ID 60');
console.log('='.repeat(80));
console.log('');

// 1. Информация о продукте
db.get(`SELECT p.*, pc.name as category_name 
        FROM products p 
        JOIN product_categories pc ON p.category_id = pc.id 
        WHERE p.id = 60`, (err, product) => {
  if (err) {
    console.error('Ошибка:', err);
    return;
  }
  
  console.log('📦 ПРОДУКТ:');
  console.log(JSON.stringify(product, null, 2));
  console.log('');

  // 2. Шаблон продукта
  db.get(`SELECT config_data FROM product_template_configs 
          WHERE product_id = 60 AND name = 'template' AND is_active = 1
          ORDER BY id DESC LIMIT 1`, (err, template) => {
    if (err) {
      console.error('Ошибка:', err);
      return;
    }
    
    console.log('📋 ШАБЛОН:');
    if (template?.config_data) {
      const configData = typeof template.config_data === 'string' 
        ? JSON.parse(template.config_data)
        : template.config_data;
      
      console.log(JSON.stringify(configData, null, 2));
      
      if (configData?.trim_size) {
        console.log(`\n✅ trim_size: ${configData.trim_size.width}×${configData.trim_size.height}`);
      } else {
        console.log('\n❌ trim_size НЕ найден!');
      }
    } else {
      console.log('❌ Шаблон не найден!');
    }
    console.log('');

    // 3. Расчет раскладки для 50×90
    console.log('📊 РАСЧЕТ РАСКЛАДКИ ДЛЯ 50×90:');
    console.log('-'.repeat(80));
    
    const productSize = { width: 50, height: 90 };
    const sra3Size = { width: 320, height: 450 };
    const MARGINS = { gap: 2, gripper: 5 };
    
    const availableWidth = sra3Size.width - MARGINS.gripper; // 315
    const availableHeight = sra3Size.height; // 450
    
    // Вариант 1: без поворота (50×90)
    const cols1 = Math.floor(availableWidth / (productSize.width + MARGINS.gap)); // 315 / 52 = 6
    const rows1 = Math.floor(availableHeight / (productSize.height + MARGINS.gap)); // 450 / 92 = 4
    const items1 = cols1 * rows1; // 24
    
    // Вариант 2: с поворотом (90×50)
    const cols2 = Math.floor(availableWidth / (productSize.height + MARGINS.gap)); // 315 / 92 = 3
    const rows2 = Math.floor(availableHeight / (productSize.width + MARGINS.gap)); // 450 / 52 = 8
    const items2 = cols2 * rows2; // 24
    
    console.log(`Размер продукта: ${productSize.width}×${productSize.height} мм`);
    console.log(`Лист SRA3: ${sra3Size.width}×${sra3Size.height} мм`);
    console.log(`Доступная область: ${availableWidth}×${availableHeight} мм`);
    console.log('');
    console.log('Вариант 1 (без поворота):');
    console.log(`  Колонок: ${cols1} (${availableWidth} / (${productSize.width} + ${MARGINS.gap}) = ${Math.floor(availableWidth / (productSize.width + MARGINS.gap))})`);
    console.log(`  Рядов: ${rows1} (${availableHeight} / (${productSize.height} + ${MARGINS.gap}) = ${Math.floor(availableHeight / (productSize.height + MARGINS.gap))})`);
    console.log(`  Шт на лист: ${items1}`);
    console.log('');
    console.log('Вариант 2 (с поворотом):');
    console.log(`  Колонок: ${cols2} (${availableWidth} / (${productSize.height} + ${MARGINS.gap}) = ${Math.floor(availableWidth / (productSize.height + MARGINS.gap))})`);
    console.log(`  Рядов: ${rows2} (${availableHeight} / (${productSize.width} + ${MARGINS.gap}) = ${Math.floor(availableHeight / (productSize.width + MARGINS.gap))})`);
    console.log(`  Шт на лист: ${items2}`);
    console.log('');
    console.log(`✅ ОПТИМАЛЬНО: ${Math.max(items1, items2)} шт на лист`);
    console.log('');
    
    // 4. Расчет для 100 шт
    const quantity = 100;
    const itemsPerSheet = Math.max(items1, items2);
    const sheetsNeeded = Math.ceil(quantity / itemsPerSheet);
    console.log(`🧮 ДЛЯ ${quantity} ШТ:`);
    console.log(`  Шт на лист: ${itemsPerSheet}`);
    console.log(`  Листов нужно: ${sheetsNeeded} (${quantity} / ${itemsPerSheet} = ${(quantity / itemsPerSheet).toFixed(2)})`);
    console.log('');
    
    // 5. Проверка, что может быть не так
    console.log('⚠️  ВОЗМОЖНАЯ ПРОБЛЕМА:');
    console.log('Если система считает 50 листов с раскладкой 2 шт на лист,');
    console.log('значит используется размер 90×50 (дефолт) вместо 50×90 из шаблона!');
    console.log('');
    
    db.close();
  });
});

