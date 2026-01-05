/**
 * СОЗДАНИЕ ПРОДУКТОВ В РАБОЧЕЙ БД (backend/data.db)
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// ПРИНУДИТЕЛЬНО используем backend/data.db
const DB_PATH = path.resolve(process.cwd(), 'backend/data.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Файл backend/data.db не найден!');
  process.exit(1);
}

console.log(`📂 Используем БД: ${DB_PATH}`);
console.log(`💾 Размер: ${(fs.statSync(DB_PATH).size / 1024).toFixed(2)} KB\n`);

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

async function seedProducts() {
  const db = new sqlite3.Database(DB_PATH);
  
  console.log('🚀 Создание продуктов в РАБОЧЕЙ БД...\n');
  
  try {
    // Проверяем существующие продукты
    const existing = await getAllRows(db, 'SELECT id, name FROM products');
    console.log(`📦 Существующих продуктов: ${existing.length}`);
    existing.forEach(p => console.log(`   - ${p.name} (ID: ${p.id})`));
    console.log('');
    
    // Получаем или создаем категорию
    let category = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM product_categories WHERE name = ?', ['Печатная продукция'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    let categoryId;
    if (!category) {
      console.log('📁 Создание категории "Печатная продукция"...');
      categoryId = await runQuery(db, `
        INSERT INTO product_categories (name, icon, description, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?)
      `, ['Печатная продукция', '🖨️', 'Листовки, визитки, документы', 1, 1]);
      console.log(`✅ Категория создана (ID: ${categoryId})\n`);
    } else {
      categoryId = category.id;
      console.log(`✅ Категория уже существует (ID: ${categoryId})\n`);
    }
    
    // Шаблоны продуктов
    const templates = [
      {
        name: 'Листовки (Тест)',
        description: 'Цветные листовки различных форматов',
        icon: '📄',
        params: [
          { name: 'format', label: 'Формат', type: 'select', options: ['A6', 'A5', 'A4', 'A3'], required: 1, sort: 1 },
          { name: 'quantity', label: 'Количество', type: 'number', min: 1, max: 100000, required: 1, sort: 2 },
          { name: 'sides', label: 'Стороны печати', type: 'select', options: ['1', '2'], required: 1, sort: 3 },
          { name: 'paper_type', label: 'Тип бумаги', type: 'select', options: ['Мелованная глянцевая', 'Мелованная матовая', 'Офсетная'], required: 1, sort: 4 },
          { name: 'paper_density', label: 'Плотность', type: 'select', options: ['130', '150', '200', '300'], required: 1, sort: 5 },
          { name: 'lamination', label: 'Ламинирование', type: 'select', options: ['Нет', 'Матовое', 'Глянцевое'], required: 0, sort: 6 },
          { name: 'urgency', label: 'Срочность', type: 'select', options: ['standard', 'urgent', 'express'], required: 1, sort: 7 }
        ]
      },
      {
        name: 'Визитки (Тест)',
        description: 'Визитные карточки различных типов',
        icon: '💳',
        params: [
          { name: 'card_type', label: 'Тип визитки', type: 'select', options: ['Стандартные', 'Ламинированные', 'Магнитные'], required: 1, sort: 1 },
          { name: 'size', label: 'Размер', type: 'select', options: ['85x55', '90x50'], required: 1, sort: 2 },
          { name: 'quantity', label: 'Количество', type: 'number', min: 50, max: 10000, required: 1, sort: 3 },
          { name: 'sides', label: 'Печать', type: 'select', options: ['Односторонняя', 'Двухсторонняя'], required: 1, sort: 4 },
          { name: 'lamination', label: 'Ламинирование', type: 'checkbox', required: 0, sort: 5 },
          { name: 'rounded_corners', label: 'Скругление углов', type: 'checkbox', required: 0, sort: 6 }
        ]
      },
      {
        name: 'Печать документов (Тест)',
        description: 'Многостраничные документы с переплетом',
        icon: '📚',
        params: [
          { name: 'pages', label: 'Количество страниц', type: 'number', min: 1, max: 1000, required: 1, sort: 1 },
          { name: 'quantity', label: 'Экземпляров', type: 'number', min: 1, max: 1000, required: 1, sort: 2 },
          { name: 'format', label: 'Формат', type: 'select', options: ['A5', 'A4', 'A3'], required: 1, sort: 3 },
          { name: 'print_type', label: 'Тип печати', type: 'select', options: ['Цветная', 'Черно-белая'], required: 1, sort: 4 },
          { name: 'binding_type', label: 'Переплет', type: 'select', options: ['Без переплета', 'На пружину', 'На скобу', 'Твердый'], required: 1, sort: 5 },
          { name: 'duplex_printing', label: 'Двухсторонняя', type: 'checkbox', required: 0, sort: 6 }
        ]
      }
    ];
    
    // Создаем продукты
    for (const template of templates) {
      console.log(`\n📦 Создание: ${template.name}`);
      
      // Проверяем существование
      const exists = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM products WHERE name = ?', [template.name], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      let productId;
      if (exists) {
        console.log(`   ⚠️  Продукт уже существует (ID: ${exists.id}), пропускаем...`);
        continue;
      }
      
      // Создаем продукт
      productId = await runQuery(db, `
        INSERT INTO products (name, description, category_id, icon, calculator_type, product_type, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [template.name, template.description, categoryId, template.icon, 'product', 
          template.name.includes('документ') ? 'multi_page' : 'sheet_single', 1]);
      
      console.log(`   ✅ Продукт создан (ID: ${productId})`);
      
      // Создаем параметры
      for (const param of template.params) {
        await runQuery(db, `
          INSERT INTO product_parameters (product_id, name, label, type, options, min_value, max_value, is_required, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [productId, param.name, param.label, param.type, 
            param.options ? JSON.stringify(param.options) : null,
            param.min || null, param.max || null, param.required, param.sort]);
      }
      console.log(`   ✅ Параметров добавлено: ${template.params.length}`);
    }
    
    // Итоговая статистика
    const finalProducts = await getAllRows(db, 'SELECT id, name, is_active FROM products ORDER BY id');
    const finalParams = await getAllRows(db, 'SELECT COUNT(*) as count FROM product_parameters');
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ ГОТОВО!');
    console.log('='.repeat(60));
    console.log(`\n📦 Всего продуктов в БД: ${finalProducts.length}`);
    finalProducts.forEach(p => {
      console.log(`   ${p.is_active ? '✅' : '❌'} ID ${p.id}: ${p.name}`);
    });
    console.log(`\n📋 Всего параметров: ${finalParams[0].count}`);
    
    console.log('\n🎯 Следующие шаги:');
    console.log('  1. Перезапустите backend (Ctrl+C, затем npm run dev)');
    console.log('  2. Откройте админку: http://localhost:5173/adminpanel/products');
    console.log('  3. Очистите кэш: Ctrl+Shift+R');
    console.log('  4. Проверьте продукты!\n');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    db.close();
  }
}

seedProducts();

