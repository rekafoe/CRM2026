const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data.db');

console.log('🔧 Fixing created_at column in orders table...');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// Добавляем колонку created_at если её нет
db.run(`ALTER TABLE orders ADD COLUMN created_at TEXT DEFAULT (datetime('now'))`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('❌ Error adding created_at column:', err.message);
  } else {
    console.log('✅ created_at column added or already exists');
  }
});

// Копируем данные из createdAt в created_at
db.run(`UPDATE orders SET created_at = createdAt WHERE createdAt IS NOT NULL AND created_at IS NULL`, (err) => {
  if (err) {
    console.error('❌ Error copying data:', err.message);
  } else {
    console.log('✅ Data copied from createdAt to created_at');
  }
});

// Проверяем результат
db.all(`SELECT id, createdAt, created_at FROM orders LIMIT 3`, (err, rows) => {
  if (err) {
    console.error('❌ Error checking data:', err.message);
  } else {
    console.log('📊 Sample data:');
    rows.forEach(row => {
      console.log(`  ID: ${row.id}, createdAt: ${row.createdAt}, created_at: ${row.created_at}`);
    });
  }
  
  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err.message);
    } else {
      console.log('🎉 Database fixed successfully!');
    }
  });
});
