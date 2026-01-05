const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Подключение к базе данных
const dbPath = path.join(__dirname, '..', 'data.db');
const db = new sqlite3.Database(dbPath);

console.log('🌱 Заполнение CRM реалистичными тестовыми данными...');

// Очистка существующих данных
const clearData = () => {
  return new Promise((resolve, reject) => {
    console.log('🧹 Очистка существующих данных...');
    
    const tables = [
      'material_moves',
      'materials', 
      'material_categories',
      'suppliers',
      'users'
    ];
    
    let completed = 0;
    tables.forEach(table => {
      db.run(`DELETE FROM ${table}`, (err) => {
        if (err) {
          console.error(`Ошибка очистки ${table}:`, err);
        }
        completed++;
        if (completed === tables.length) {
          resolve();
        }
      });
    });
  });
};

// Создание пользователей
const createUsers = () => {
  return new Promise((resolve, reject) => {
    console.log('👥 Создание пользователей...');
    
    const users = [
      { name: 'Администратор', email: 'admin@printcore.by', role: 'admin', api_token: 'admin-token-123' },
      { name: 'Менеджер склада', email: 'warehouse@printcore.by', role: 'manager', api_token: 'manager-token-456' },
      { name: 'Оператор', email: 'operator@printcore.by', role: 'operator', api_token: 'operator-token-789' }
    ];
    
    const stmt = db.prepare('INSERT INTO users (name, email, role, api_token, created_at) VALUES (?, ?, ?, ?, ?)');
    
    users.forEach(user => {
      stmt.run(user.name, user.email, user.role, user.api_token, new Date().toISOString());
    });
    
    stmt.finalize((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// Создание категорий материалов
const createCategories = () => {
  return new Promise((resolve, reject) => {
    console.log('📂 Создание категорий материалов...');
    
    const categories = [
      { name: 'Бумага офсетная', color: '#3b82f6', description: 'Основная бумага для печати' },
      { name: 'Бумага мелованная', color: '#10b981', description: 'Глянцевая бумага для рекламы' },
      { name: 'Картон', color: '#f59e0b', description: 'Плотный материал для упаковки' },
      { name: 'Пленка самоклеящаяся', color: '#ef4444', description: 'Виниловая пленка для наклеек' },
      { name: 'Краски и тонеры', color: '#8b5cf6', description: 'Расходные материалы для печати' },
      { name: 'Бумага дизайнерская', color: '#06b6d4', description: 'Специальная бумага для творчества' },
      { name: 'Упаковочные материалы', color: '#84cc16', description: 'Материалы для упаковки заказов' },
      { name: 'Канцелярские товары', color: '#f97316', description: 'Офисные принадлежности' }
    ];
    
    const stmt = db.prepare('INSERT INTO material_categories (name, color, description, created_at) VALUES (?, ?, ?, ?)');
    
    categories.forEach(category => {
      stmt.run(category.name, category.color, category.description, new Date().toISOString());
    });
    
    stmt.finalize((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// Создание поставщиков
const createSuppliers = () => {
  return new Promise((resolve, reject) => {
    console.log('🏢 Создание поставщиков...');
    
    const suppliers = [
      { 
        name: 'Белорусская бумажная фабрика', 
        contact_person: 'Иван Петров',
        email: 'ivan@belpaper.by',
        phone: '+375 17 123-45-67',
        address: 'г. Минск, ул. Промышленная, 15',
        is_active: 1,
        notes: 'Основной поставщик бумаги. Надежный партнер с 15-летним опытом.'
      },
      { 
        name: 'Европа-Картон', 
        contact_person: 'Мария Сидорова',
        email: 'maria@eurocardboard.com',
        phone: '+375 29 234-56-78',
        address: 'г. Гродно, ул. Заводская, 8',
        is_active: 1,
        notes: 'Специализируется на картоне и упаковочных материалах. Быстрая доставка.'
      },
      { 
        name: 'Полиграф-Сервис', 
        contact_person: 'Алексей Козлов',
        email: 'alex@polygraph.by',
        phone: '+375 25 345-67-89',
        address: 'г. Витебск, пр. Строителей, 22',
        is_active: 1,
        notes: 'Поставщик расходных материалов для печати. Широкий ассортимент.'
      },
      { 
        name: 'Креатив-Материалы', 
        contact_person: 'Елена Волкова',
        email: 'elena@creativematerials.by',
        phone: '+375 33 456-78-90',
        address: 'г. Могилев, ул. Творческая, 5',
        is_active: 1,
        notes: 'Дизайнерские материалы и специальная бумага. Высокое качество.'
      },
      { 
        name: 'Универсал-Снаб', 
        contact_person: 'Дмитрий Новиков',
        email: 'dmitry@universal.by',
        phone: '+375 44 567-89-01',
        address: 'г. Брест, ул. Универсальная, 12',
        is_active: 1,
        notes: 'Универсальный поставщик. Конкурентные цены, но иногда задержки.'
      },
      { 
        name: 'Премиум-Печать', 
        contact_person: 'Ольга Морозова',
        email: 'olga@premiumprint.by',
        phone: '+375 29 678-90-12',
        address: 'г. Гомель, ул. Премиум, 3',
        is_active: 0,
        notes: 'Премиум материалы. Высокие цены, но отличное качество. Временно неактивен.'
      }
    ];
    
    const stmt = db.prepare(`
      INSERT INTO suppliers (name, contact_person, email, phone, address, is_active, notes, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    suppliers.forEach(supplier => {
      stmt.run(
        supplier.name, supplier.contact_person, supplier.email, supplier.phone,
        supplier.address, supplier.is_active, supplier.notes, new Date().toISOString()
      );
    });
    
    stmt.finalize((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// Создание материалов с реалистичными данными
const createMaterials = () => {
  return new Promise((resolve, reject) => {
    console.log('📦 Создание материалов...');
    
    const materials = [
      // Бумага офсетная
      { name: 'Бумага офсетная А4 80г/м²', category_id: 1, supplier_id: 1, quantity: 1500, unit: 'лист', min_quantity: 500, sheet_price_single: 0.15, location: 'Стеллаж А-1', barcode: '2000001', notes: 'Основная бумага для документов' },
      { name: 'Бумага офсетная А3 80г/м²', category_id: 1, supplier_id: 1, quantity: 800, unit: 'лист', min_quantity: 200, sheet_price_single: 0.25, location: 'Стеллаж А-2', barcode: '2000002', notes: 'Для больших форматов' },
      { name: 'Бумага офсетная А4 120г/м²', category_id: 1, supplier_id: 1, quantity: 300, unit: 'лист', min_quantity: 100, sheet_price_single: 0.22, location: 'Стеллаж А-3', barcode: '2000003', notes: 'Плотная бумага' },
      
      // Бумага мелованная
      { name: 'Бумага мелованная А4 130г/м²', category_id: 2, supplier_id: 1, quantity: 1200, unit: 'лист', min_quantity: 300, sheet_price_single: 0.35, location: 'Стеллаж Б-1', barcode: '2000004', notes: 'Глянцевая для рекламы' },
      { name: 'Бумага мелованная А3 150г/м²', category_id: 2, supplier_id: 1, quantity: 600, unit: 'лист', min_quantity: 150, sheet_price_single: 0.55, location: 'Стеллаж Б-2', barcode: '2000005', notes: 'Для презентаций' },
      { name: 'Бумага мелованная А4 200г/м²', category_id: 2, supplier_id: 1, quantity: 200, unit: 'лист', min_quantity: 50, sheet_price_single: 0.65, location: 'Стеллаж Б-3', barcode: '2000006', notes: 'Премиум качество' },
      
      // Картон
      { name: 'Картон белый А4 300г/м²', category_id: 3, supplier_id: 2, quantity: 400, unit: 'лист', min_quantity: 100, sheet_price_single: 1.20, location: 'Стеллаж В-1', barcode: '2000007', notes: 'Для визиток и открыток' },
      { name: 'Картон цветной А4 250г/м²', category_id: 3, supplier_id: 2, quantity: 250, unit: 'лист', min_quantity: 50, sheet_price_single: 1.50, location: 'Стеллаж В-2', barcode: '2000008', notes: 'Цветной картон' },
      { name: 'Картон упаковочный', category_id: 3, supplier_id: 2, quantity: 50, unit: 'лист', min_quantity: 20, sheet_price_single: 2.00, location: 'Стеллаж В-3', barcode: '2000009', notes: 'Для упаковки' },
      
      // Пленка самоклеящаяся
      { name: 'Пленка белая матовая', category_id: 4, supplier_id: 3, quantity: 30, unit: 'м²', min_quantity: 10, sheet_price_single: 15.00, location: 'Стеллаж Г-1', barcode: '2000010', notes: 'Для наклеек' },
      { name: 'Пленка прозрачная', category_id: 4, supplier_id: 3, quantity: 25, unit: 'м²', min_quantity: 8, sheet_price_single: 18.00, location: 'Стеллаж Г-2', barcode: '2000011', notes: 'Прозрачная пленка' },
      { name: 'Пленка цветная', category_id: 4, supplier_id: 3, quantity: 15, unit: 'м²', min_quantity: 5, sheet_price_single: 22.00, location: 'Стеллаж Г-3', barcode: '2000012', notes: 'Цветная пленка' },
      
      // Краски и тонеры
      { name: 'Тонер черный HP', category_id: 5, supplier_id: 3, quantity: 12, unit: 'шт', min_quantity: 5, sheet_price_single: 45.00, location: 'Стеллаж Д-1', barcode: '2000013', notes: 'Для принтеров HP' },
      { name: 'Тонер цветной Canon', category_id: 5, supplier_id: 3, quantity: 8, unit: 'шт', min_quantity: 3, sheet_price_single: 65.00, location: 'Стеллаж Д-2', barcode: '2000014', notes: 'Цветной тонер' },
      { name: 'Краска для плоттера', category_id: 5, supplier_id: 3, quantity: 6, unit: 'шт', min_quantity: 2, sheet_price_single: 120.00, location: 'Стеллаж Д-3', barcode: '2000015', notes: 'Для широкоформатной печати' },
      
      // Бумага дизайнерская
      { name: 'Бумага фактурная', category_id: 6, supplier_id: 4, quantity: 80, unit: 'лист', min_quantity: 20, sheet_price_single: 2.50, location: 'Стеллаж Е-1', barcode: '2000016', notes: 'Фактурная бумага' },
      { name: 'Бумага металлизированная', category_id: 6, supplier_id: 4, quantity: 40, unit: 'лист', min_quantity: 10, sheet_price_single: 4.00, location: 'Стеллаж Е-2', barcode: '2000017', notes: 'Металлический эффект' },
      { name: 'Бумага перламутровая', category_id: 6, supplier_id: 4, quantity: 30, unit: 'лист', min_quantity: 8, sheet_price_single: 3.50, location: 'Стеллаж Е-3', barcode: '2000018', notes: 'Перламутровый блеск' },
      
      // Упаковочные материалы
      { name: 'Пакеты полиэтиленовые', category_id: 7, supplier_id: 5, quantity: 200, unit: 'шт', min_quantity: 50, sheet_price_single: 0.50, location: 'Стеллаж Ж-1', barcode: '2000019', notes: 'Для упаковки заказов' },
      { name: 'Конверты А4', category_id: 7, supplier_id: 5, quantity: 500, unit: 'шт', min_quantity: 100, sheet_price_single: 0.30, location: 'Стеллаж Ж-2', barcode: '2000020', notes: 'Стандартные конверты' },
      { name: 'Скотч упаковочный', category_id: 7, supplier_id: 5, quantity: 25, unit: 'шт', min_quantity: 5, sheet_price_single: 8.00, location: 'Стеллаж Ж-3', barcode: '2000021', notes: 'Упаковочный скотч' },
      
      // Канцелярские товары
      { name: 'Ручки шариковые', category_id: 8, supplier_id: 5, quantity: 100, unit: 'шт', min_quantity: 20, sheet_price_single: 1.50, location: 'Стеллаж З-1', barcode: '2000022', notes: 'Офисные ручки' },
      { name: 'Карандаши', category_id: 8, supplier_id: 5, quantity: 50, unit: 'шт', min_quantity: 10, sheet_price_single: 2.00, location: 'Стеллаж З-2', barcode: '2000023', notes: 'Простой карандаш' },
      { name: 'Маркеры', category_id: 8, supplier_id: 5, quantity: 30, unit: 'шт', min_quantity: 5, sheet_price_single: 3.50, location: 'Стеллаж З-3', barcode: '2000024', notes: 'Цветные маркеры' },
      
      // Материалы с критически низким остатком
      { name: 'Бумага офсетная А4 80г/м² (критический остаток)', category_id: 1, supplier_id: 1, quantity: 50, unit: 'лист', min_quantity: 500, sheet_price_single: 0.15, location: 'Стеллаж А-1', barcode: '2000025', notes: 'ТРЕБУЕТСЯ ЗАКАЗ!' },
      { name: 'Тонер черный Canon', category_id: 5, supplier_id: 3, quantity: 1, unit: 'шт', min_quantity: 3, sheet_price_single: 50.00, location: 'Стеллаж Д-1', barcode: '2000026', notes: 'КРИТИЧЕСКИЙ ОСТАТОК!' },
      { name: 'Пленка белая глянцевая', category_id: 4, supplier_id: 3, quantity: 2, unit: 'м²', min_quantity: 8, sheet_price_single: 20.00, location: 'Стеллаж Г-1', barcode: '2000027', notes: 'ПОЧТИ ЗАКОНЧИЛАСЬ!' }
    ];
    
    const stmt = db.prepare(`
      INSERT INTO materials (name, category_id, supplier_id, quantity, unit, min_quantity, sheet_price_single, location, barcode, notes, is_active, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);
    
    materials.forEach(material => {
      stmt.run(
        material.name, material.category_id, material.supplier_id, material.quantity,
        material.unit, material.min_quantity, material.sheet_price_single, material.location,
        material.barcode, material.notes, new Date().toISOString()
      );
    });
    
    stmt.finalize((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// Создание движений материалов для демонстрации аналитики
const createMaterialMovements = () => {
  return new Promise((resolve, reject) => {
    console.log('📊 Создание движений материалов...');
    
    const movements = [];
    const now = new Date();
    
    // Создаем движения за последние 6 месяцев
    for (let month = 0; month < 6; month++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - month, 1);
      
      // Приходы материалов (заказы поставщикам)
      for (let day = 1; day <= 28; day += 3) {
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
        const materialId = Math.floor(Math.random() * 27) + 1; // 1-27
        const quantity = Math.floor(Math.random() * 500) + 100;
        
        movements.push({
          material_id: materialId,
          type: 'in',
          quantity: quantity,
          reason: 'Поступление от поставщика',
          created_at: date.toISOString(),
          user_id: 2 // Менеджер склада
        });
      }
      
      // Расходы материалов (использование в заказах)
      for (let day = 2; day <= 28; day += 2) {
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
        const materialId = Math.floor(Math.random() * 27) + 1;
        const quantity = Math.floor(Math.random() * 200) + 50;
        
        movements.push({
          material_id: materialId,
          type: 'out',
          quantity: quantity,
          reason: 'Использование в заказе',
          created_at: date.toISOString(),
          user_id: 3 // Оператор
        });
      }
      
      // Корректировки остатков
      for (let day = 5; day <= 28; day += 7) {
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
        const materialId = Math.floor(Math.random() * 27) + 1;
        const quantity = Math.floor(Math.random() * 100) - 50; // -50 до +50
        
        movements.push({
          material_id: materialId,
          type: 'adjustment',
          quantity: quantity,
          reason: 'Инвентаризация',
          created_at: date.toISOString(),
          user_id: 1 // Администратор
        });
      }
    }
    
    const stmt = db.prepare(`
      INSERT INTO material_moves (material_id, type, quantity, reason, created_at, user_id) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    movements.forEach(movement => {
      stmt.run(
        movement.material_id, movement.type, movement.quantity,
        movement.reason, movement.created_at, movement.user_id
      );
    });
    
    stmt.finalize((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// Основная функция
const seedData = async () => {
  try {
    await clearData();
    await createUsers();
    await createCategories();
    await createSuppliers();
    await createMaterials();
    await createMaterialMovements();
    
    console.log('✅ Тестовые данные успешно созданы!');
    console.log('\n📊 Создано:');
    console.log('👥 3 пользователя (админ, менеджер, оператор)');
    console.log('📂 8 категорий материалов');
    console.log('🏢 6 поставщиков (5 активных, 1 неактивный)');
    console.log('📦 27 материалов с разными остатками');
    console.log('📈 ~500 движений материалов за 6 месяцев');
    console.log('\n🎯 Теперь можно протестировать всю аналитику!');
    
  } catch (error) {
    console.error('❌ Ошибка при создании тестовых данных:', error);
  } finally {
    db.close();
  }
};

// Запуск
seedData();
