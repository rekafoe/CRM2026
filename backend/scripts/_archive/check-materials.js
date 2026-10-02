const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data.db');

console.log('Checking materials in database...');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to database');
});

// Проверяем количество материалов
db.all('SELECT COUNT(*) as count FROM materials', (err, rows) => {
  if (err) {
    console.error('Error counting materials:', err.message);
  } else {
    console.log(`Materials count: ${rows[0].count}`);
  }
});

// Проверяем категории материалов
db.all('SELECT COUNT(*) as count FROM material_categories', (err, rows) => {
  if (err) {
    console.error('Error counting material categories:', err.message);
  } else {
    console.log(`Material categories count: ${rows[0].count}`);
  }
});

// Показываем первые 5 материалов
db.all('SELECT id, name, category_id, quantity FROM materials LIMIT 5', (err, rows) => {
  if (err) {
    console.error('Error fetching materials:', err.message);
  } else {
    console.log('Sample materials:');
    rows.forEach(row => {
      console.log(`  ID: ${row.id}, Name: ${row.name}, Category: ${row.category_id}, Quantity: ${row.quantity}`);
    });
  }
  
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Check completed!');
    }
  });
});
