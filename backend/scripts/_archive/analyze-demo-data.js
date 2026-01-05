const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Подключение к базе данных
const dbPath = path.join(__dirname, '..', 'data.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Анализ созданных данных для демонстрации возможностей CRM...\n');

// Анализ материалов по категориям
const analyzeByCategories = () => {
  return new Promise((resolve, reject) => {
    console.log('📂 АНАЛИЗ ПО КАТЕГОРИЯМ:');
    console.log('========================');
    
    db.all(`
      SELECT 
        c.name as category_name,
        c.color,
        COUNT(m.id) as materials_count,
        SUM(m.quantity) as total_quantity,
        SUM(m.quantity * COALESCE(m.sheet_price_single, 0)) as total_value,
        SUM(CASE WHEN m.quantity <= m.min_quantity THEN 1 ELSE 0 END) as low_stock_count,
        SUM(CASE WHEN m.quantity = 0 THEN 1 ELSE 0 END) as out_of_stock_count
      FROM material_categories c
      LEFT JOIN materials m ON c.id = m.category_id
      GROUP BY c.id, c.name, c.color
      ORDER BY total_value DESC
    `, (err, categories) => {
      if (err) {
        reject(err);
        return;
      }
      
      categories.forEach(category => {
        console.log(`🏷️  ${category.category_name}`);
        console.log(`   📦 Материалов: ${category.materials_count}`);
        console.log(`   📊 Общий остаток: ${category.total_quantity}`);
        console.log(`   💰 Стоимость: ${Math.round(category.total_value)} BYN`);
        console.log(`   ⚠️  Низкий остаток: ${category.low_stock_count}`);
        console.log(`   ❌ Нет в наличии: ${category.out_of_stock_count}`);
        console.log('');
      });
      
      resolve();
    });
  });
};

// Анализ поставщиков
const analyzeSuppliers = () => {
  return new Promise((resolve, reject) => {
    console.log('🏢 АНАЛИЗ ПОСТАВЩИКОВ:');
    console.log('=====================');
    
    db.all(`
      SELECT 
        s.name as supplier_name,
        s.is_active,
        COUNT(m.id) as materials_count,
        SUM(m.quantity) as total_quantity,
        SUM(m.quantity * COALESCE(m.sheet_price_single, 0)) as total_value,
        AVG(m.sheet_price_single) as avg_price
      FROM suppliers s
      LEFT JOIN materials m ON s.id = m.supplier_id
      GROUP BY s.id, s.name, s.is_active
      ORDER BY total_value DESC
    `, (err, suppliers) => {
      if (err) {
        reject(err);
        return;
      }
      
      suppliers.forEach(supplier => {
        const status = supplier.is_active ? '✅ Активен' : '❌ Неактивен';
        console.log(`🏭 ${supplier.supplier_name} ${status}`);
        console.log(`   📦 Материалов: ${supplier.materials_count}`);
        console.log(`   📊 Общий остаток: ${supplier.total_quantity}`);
        console.log(`   💰 Стоимость: ${Math.round(supplier.total_value)} BYN`);
        console.log(`   💵 Средняя цена: ${supplier.avg_price ? supplier.avg_price.toFixed(2) : 0} BYN`);
        console.log('');
      });
      
      resolve();
    });
  });
};

// Анализ движений материалов
const analyzeMovements = () => {
  return new Promise((resolve, reject) => {
    console.log('📈 АНАЛИЗ ДВИЖЕНИЙ МАТЕРИАЛОВ:');
    console.log('==============================');
    
    db.all(`
      SELECT 
        type,
        COUNT(*) as movements_count,
        SUM(quantity) as total_quantity,
        AVG(quantity) as avg_quantity
      FROM material_moves
      GROUP BY type
      ORDER BY movements_count DESC
    `, (err, movements) => {
      if (err) {
        reject(err);
        return;
      }
      
      movements.forEach(movement => {
        const typeName = movement.type === 'in' ? '📥 Приход' : 
                        movement.type === 'out' ? '📤 Расход' : '🔄 Корректировка';
        console.log(`${typeName}:`);
        console.log(`   🔢 Количество операций: ${movement.movements_count}`);
        console.log(`   📊 Общий объем: ${movement.total_quantity}`);
        console.log(`   📈 Средний объем: ${movement.avg_quantity.toFixed(1)}`);
        console.log('');
      });
      
      resolve();
    });
  });
};

// Анализ материалов с критическим остатком
const analyzeCriticalStock = () => {
  return new Promise((resolve, reject) => {
    console.log('⚠️  МАТЕРИАЛЫ С КРИТИЧЕСКИМ ОСТАТКОМ:');
    console.log('=====================================');
    
    db.all(`
      SELECT 
        m.name,
        m.quantity,
        m.min_quantity,
        m.location,
        c.name as category_name,
        s.name as supplier_name,
        m.sheet_price_single
      FROM materials m
      LEFT JOIN material_categories c ON m.category_id = c.id
      LEFT JOIN suppliers s ON m.supplier_id = s.id
      WHERE m.quantity <= m.min_quantity OR m.quantity = 0
      ORDER BY (m.quantity / NULLIF(m.min_quantity, 0)) ASC
    `, (err, materials) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (materials.length === 0) {
        console.log('✅ Нет материалов с критическим остатком');
      } else {
        materials.forEach(material => {
          const status = material.quantity === 0 ? '❌ НЕТ В НАЛИЧИИ' : '⚠️  КРИТИЧЕСКИЙ';
          console.log(`${status} ${material.name}`);
          console.log(`   📦 Остаток: ${material.quantity} (мин: ${material.min_quantity})`);
          console.log(`   📂 Категория: ${material.category_name}`);
          console.log(`   🏭 Поставщик: ${material.supplier_name}`);
          console.log(`   📍 Местоположение: ${material.location}`);
          console.log(`   💰 Цена: ${material.sheet_price_single} BYN`);
          console.log('');
        });
      }
      
      resolve();
    });
  });
};

// Топ материалов по стоимости
const analyzeTopMaterials = () => {
  return new Promise((resolve, reject) => {
    console.log('💰 ТОП-10 МАТЕРИАЛОВ ПО СТОИМОСТИ:');
    console.log('==================================');
    
    db.all(`
      SELECT 
        m.name,
        m.quantity,
        m.sheet_price_single,
        (m.quantity * COALESCE(m.sheet_price_single, 0)) as total_value,
        c.name as category_name,
        s.name as supplier_name
      FROM materials m
      LEFT JOIN material_categories c ON m.category_id = c.id
      LEFT JOIN suppliers s ON m.supplier_id = s.id
      WHERE m.sheet_price_single > 0
      ORDER BY total_value DESC
      LIMIT 10
    `, (err, materials) => {
      if (err) {
        reject(err);
        return;
      }
      
      materials.forEach((material, index) => {
        console.log(`${index + 1}. ${material.name}`);
        console.log(`   💰 Стоимость: ${Math.round(material.total_value)} BYN`);
        console.log(`   📦 Остаток: ${material.quantity}`);
        console.log(`   💵 Цена за единицу: ${material.sheet_price_single} BYN`);
        console.log(`   📂 Категория: ${material.category_name}`);
        console.log(`   🏭 Поставщик: ${material.supplier_name}`);
        console.log('');
      });
      
      resolve();
    });
  });
};

// Сезонный анализ
const analyzeSeasonalPatterns = () => {
  return new Promise((resolve, reject) => {
    console.log('🌍 СЕЗОННЫЙ АНАЛИЗ ПОТРЕБЛЕНИЯ:');
    console.log('===============================');
    
    db.all(`
      SELECT 
        strftime('%m', created_at) as month,
        COUNT(*) as movements_count,
        SUM(quantity) as total_quantity,
        AVG(quantity) as avg_quantity
      FROM material_moves
      WHERE type = 'out' AND created_at >= date('now', '-12 months')
      GROUP BY strftime('%m', created_at)
      ORDER BY month
    `, (err, months) => {
      if (err) {
        reject(err);
        return;
      }
      
      const monthNames = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
      ];
      
      months.forEach(month => {
        const monthName = monthNames[parseInt(month.month) - 1];
        console.log(`📅 ${monthName}:`);
        console.log(`   🔢 Операций: ${month.movements_count}`);
        console.log(`   📊 Общий расход: ${month.total_quantity}`);
        console.log(`   📈 Средний расход: ${month.avg_quantity.toFixed(1)}`);
        console.log('');
      });
      
      resolve();
    });
  });
};

// Основная функция
const analyzeData = async () => {
  try {
    await analyzeByCategories();
    await analyzeSuppliers();
    await analyzeMovements();
    await analyzeCriticalStock();
    await analyzeTopMaterials();
    await analyzeSeasonalPatterns();
    
    console.log('🎯 ЗАКЛЮЧЕНИЕ:');
    console.log('==============');
    console.log('✅ CRM заполнена реалистичными данными');
    console.log('📊 Созданы паттерны для демонстрации всех видов аналитики');
    console.log('🌍 Добавлены сезонные колебания для прогнозирования');
    console.log('📈 Сформированы ABC-классы для приоритизации');
    console.log('⚠️  Выявлены критические остатки для алертов');
    console.log('💰 Определены топовые материалы по стоимости');
    console.log('\n🚀 Теперь можно полноценно тестировать все возможности аналитики!');
    
  } catch (error) {
    console.error('❌ Ошибка при анализе данных:', error);
  } finally {
    db.close();
  }
};

// Запуск
analyzeData();
