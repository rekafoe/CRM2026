const up = async (db) => {
  console.log('🗑️ Removing paper_type_prices table...');
  
  try {
    // Удаляем таблицу с ценами типов бумаги
    await db.exec('DROP TABLE IF EXISTS paper_type_prices;');
    console.log('✅ Paper type prices table removed');
  } catch (error) {
    console.log('⚠️ Paper type prices table may not exist:', error.message);
    // Не выбрасываем ошибку, так как таблица может не существовать
  }
};

const down = async (db) => {
  console.log('🔄 Restoring paper_type_prices table...');
  
  try {
    // Восстанавливаем таблицу (если нужно откатить)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS paper_type_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        paper_type_id INTEGER NOT NULL,
        density INTEGER NOT NULL,
        price REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(paper_type_id, density),
        FOREIGN KEY(paper_type_id) REFERENCES paper_types(id) ON DELETE CASCADE
      );
    `);
    console.log('✅ Paper type prices table restored');
  } catch (error) {
    console.log('⚠️ Failed to restore paper_type_prices table:', error.message);
    throw error;
  }
};

module.exports = { up, down };
