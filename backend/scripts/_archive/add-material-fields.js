#!/usr/bin/env node
/**
 * Скрипт для добавления недостающих полей в таблицу materials
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data.db');

async function addMissingFields() {
  console.log('🔧 Adding missing fields to materials table...\n');

  const db = new sqlite3.Database(DB_PATH);

  try {
    // Проверяем, какие поля уже есть
    const columns = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(materials)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log('📋 Current columns in materials table:');
    columns.forEach(col => console.log(`   - ${col.name} (${col.type})`));

    // Добавляем недостающие поля
    const fieldsToAdd = [
      { name: 'min_stock_level', sql: 'ALTER TABLE materials ADD COLUMN min_stock_level REAL DEFAULT 0' },
      { name: 'location', sql: 'ALTER TABLE materials ADD COLUMN location TEXT' },
      { name: 'barcode', sql: 'ALTER TABLE materials ADD COLUMN barcode TEXT' },
      { name: 'sku', sql: 'ALTER TABLE materials ADD COLUMN sku TEXT' },
      { name: 'notes', sql: 'ALTER TABLE materials ADD COLUMN notes TEXT' },
      { name: 'is_active', sql: 'ALTER TABLE materials ADD COLUMN is_active INTEGER DEFAULT 1' }
    ];

    for (const field of fieldsToAdd) {
      const exists = columns.some(col => col.name === field.name);
      if (!exists) {
        console.log(`➕ Adding field: ${field.name}`);
        await new Promise((resolve, reject) => {
          db.run(field.sql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } else {
        console.log(`✅ Field already exists: ${field.name}`);
      }
    }

    // Проверяем результат
    const newColumns = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(materials)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log('\n📋 Updated columns in materials table:');
    newColumns.forEach(col => console.log(`   - ${col.name} (${col.type})`));

    console.log('\n🎉 Fields added successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    db.close();
  }
}

addMissingFields().catch((err) => {
  console.error('\n❌ Script failed:', err);
  process.exit(1);
});
