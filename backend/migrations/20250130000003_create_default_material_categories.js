const { Database } = require('sqlite');

const up = async (db) => {
  console.log('📋 Creating default material categories...');
  
  // Создаем таблицу категорий материалов если не существует
  await db.exec(`
    CREATE TABLE IF NOT EXISTS material_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6c757d',
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // Создаем индекс для быстрого поиска
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_categories_name ON material_categories(name)
  `);
  
  // Добавляем базовые категории
  const categories = [
    { id: 1, name: 'Бумага', color: '#28a745', description: 'Различные типы бумаги для печати' },
    { id: 2, name: 'Краски', color: '#dc3545', description: 'Краски и чернила для печати' },
    { id: 3, name: 'Канцелярия', color: '#ffc107', description: 'Канцелярские принадлежности' },
    { id: 4, name: 'Другое', color: '#6c757d', description: 'Прочие материалы' }
  ];
  
  for (const category of categories) {
    await db.run(`
      INSERT OR IGNORE INTO material_categories (id, name, color, description)
      VALUES (?, ?, ?, ?)
    `, category.id, category.name, category.color, category.description);
  }
  
  console.log('✅ Default material categories created');
};

const down = async (db) => {
  console.log('🔄 Removing default material categories...');
  
  // Удаляем базовые категории
  await db.run('DELETE FROM material_categories WHERE id IN (1, 2, 3, 4)');
  
  console.log('✅ Default material categories removed');
};

module.exports = { up, down };
