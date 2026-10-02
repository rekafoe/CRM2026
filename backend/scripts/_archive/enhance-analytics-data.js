const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Подключение к базе данных
const dbPath = path.join(__dirname, '..', 'data.db');
const db = new sqlite3.Database(dbPath);

console.log('Добавление дополнительных движений для демонстрации аналитики...');

// Функция для обновления остатков материалов на основе движений
const updateMaterialQuantities = () => {
  return new Promise((resolve, reject) => {
    console.log('Обновление остатков материалов...');
    
    db.all(`
      SELECT 
        m.id,
        m.quantity,
        COALESCE(SUM(CASE WHEN mm.type = 'in' THEN mm.quantity ELSE 0 END), 0) as total_in,
        COALESCE(SUM(CASE WHEN mm.type = 'out' THEN mm.quantity ELSE 0 END), 0) as total_out,
        COALESCE(SUM(CASE WHEN mm.type = 'adjustment' THEN mm.quantity ELSE 0 END), 0) as total_adjustment
      FROM materials m
      LEFT JOIN material_moves mm ON m.id = mm.material_id
      GROUP BY m.id, m.quantity
    `, (err, materials) => {
      if (err) {
        reject(err);
        return;
      }
      
      const stmt = db.prepare('UPDATE materials SET quantity = ? WHERE id = ?');
      
      materials.forEach(material => {
        const newQuantity = Math.max(0, 
          material.quantity + 
          material.total_in - 
          material.total_out + 
          material.total_adjustment
        );
        
        stmt.run(newQuantity, material.id);
      });
      
      stmt.finalize((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
};

// Добавление сезонных движений для демонстрации прогнозирования
const addSeasonalMovements = () => {
  return new Promise((resolve, reject) => {
    console.log('Добавление сезонных движений...');
    
    const movements = [];
    const now = new Date();
    
    // Создаем сезонные паттерны за последние 12 месяцев
    for (let month = 0; month < 12; month++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - month, 1);
      const monthNum = monthDate.getMonth();
      
      // Определяем сезонный коэффициент
      let seasonalFactor = 1.0;
      if (monthNum >= 2 && monthNum <= 4) { // Весна - больше рекламы
        seasonalFactor = 1.3;
      } else if (monthNum >= 5 && monthNum <= 7) { // Лето - меньше активности
        seasonalFactor = 0.8;
      } else if (monthNum >= 8 && monthNum <= 10) { // Осень - подготовка к праздникам
        seasonalFactor = 1.2;
      } else { // Зима - праздничный сезон
        seasonalFactor = 1.5;
      }
      
      // Добавляем движения с учетом сезонности
      for (let day = 1; day <= 28; day += 2) {
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
        const materialId = Math.floor(Math.random() * 27) + 1;
        
        // Базовое потребление с сезонным фактором
        const baseConsumption = Math.floor(Math.random() * 100) + 50;
        const seasonalConsumption = Math.floor(baseConsumption * seasonalFactor);
        
        movements.push({
          material_id: materialId,
          type: 'out',
          quantity: seasonalConsumption,
          reason: `Сезонное потребление (${seasonalFactor.toFixed(1)}x)`,
          created_at: date.toISOString(),
          user_id: 3
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

// Добавление движений для демонстрации ABC-анализа
const addABCMovements = () => {
  return new Promise((resolve, reject) => {
    console.log('Добавление движений для ABC-анализа...');
    
    const movements = [];
    const now = new Date();
    
    // Создаем движения, которые покажут четкое разделение на ABC классы
    const abcMaterials = [
      { id: 1, name: 'Бумага офсетная А4 80г/м²', class: 'A', multiplier: 5.0 }, // Класс A - много движений
      { id: 4, name: 'Бумага мелованная А4 130г/м²', class: 'A', multiplier: 4.5 },
      { id: 7, name: 'Картон белый А4 300г/м²', class: 'A', multiplier: 4.0 },
      { id: 13, name: 'Тонер черный HP', class: 'A', multiplier: 3.5 },
      { id: 2, name: 'Бумага офсетная А3 80г/м²', class: 'B', multiplier: 2.0 }, // Класс B - средние движения
      { id: 5, name: 'Бумага мелованная А3 150г/м²', class: 'B', multiplier: 1.8 },
      { id: 8, name: 'Картон цветной А4 250г/м²', class: 'B', multiplier: 1.5 },
      { id: 14, name: 'Тонер цветной Canon', class: 'B', multiplier: 1.3 },
      { id: 22, name: 'Ручки шариковые', class: 'C', multiplier: 0.5 }, // Класс C - мало движений
      { id: 23, name: 'Карандаши', class: 'C', multiplier: 0.3 },
      { id: 24, name: 'Маркеры', class: 'C', multiplier: 0.2 }
    ];
    
    // Создаем движения за последние 6 месяцев
    for (let month = 0; month < 6; month++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - month, 1);
      
      abcMaterials.forEach(material => {
        // Количество движений зависит от класса
        const movementsCount = Math.floor(material.multiplier * 4);
        
        for (let i = 0; i < movementsCount; i++) {
          const day = Math.floor(Math.random() * 28) + 1;
          const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
          
          const quantity = Math.floor(Math.random() * 200 * material.multiplier) + 50;
          
          movements.push({
            material_id: material.id,
            type: 'out',
            quantity: quantity,
            reason: `ABC-класс ${material.class}: ${material.name}`,
            created_at: date.toISOString(),
            user_id: 3
          });
        }
      });
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
const enhanceData = async () => {
  try {
    await addSeasonalMovements();
    await addABCMovements();
    await updateMaterialQuantities();
    
    console.log('Данные для аналитики успешно добавлены!');
    console.log('\n Добавлено:');
    console.log('Сезонные движения за 12 месяцев');
    console.log('ABC-движения для демонстрации классификации');
    console.log('Обновлены остатки материалов');
    console.log('\n Теперь аналитика покажет реальные инсайты!');
    
  } catch (error) {
    console.error('Ошибка при добавлении данных:', error);
  } finally {
    db.close();
  }
};

// Запуск
enhanceData();
