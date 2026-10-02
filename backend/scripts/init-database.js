#!/usr/bin/env node
/**
 * Скрипт для быстрой инициализации БД из SQL схемы
 * Использование: node scripts/init-database.js [--force]
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data.db');
const SCHEMA_PATH = path.join(__dirname, '../schema/current_schema.sql');
const SEED_PATH = path.join(__dirname, '../schema/seed_data.sql');

const args = process.argv.slice(2);
const force = args.includes('--force');

async function initDatabase() {
  console.log(' Database Initialization Script\n');

  // Проверяем существование БД
  if (fs.existsSync(DB_PATH) && !force) {
    console.log(' Database already exists!');
    console.log('   Use --force to recreate it');
    console.log(`   Path: ${DB_PATH}\n`);
    process.exit(1);
  }

  // Удаляем старую БД если --force
  if (force && fs.existsSync(DB_PATH)) {
    console.log(' Removing old database...');
    fs.unlinkSync(DB_PATH);
  }

  // Читаем SQL файлы
  console.log('Reading schema...');
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  
  console.log('Reading seed data...');
  const seedData = fs.readFileSync(SEED_PATH, 'utf8');

  // Создаем БД
  console.log('Creating database...');
  const db = new sqlite3.Database(DB_PATH);

  // Применяем схему
  await new Promise((resolve, reject) => {
    console.log('Applying schema...');
    db.exec(schema, (err) => {
      if (err) {
        console.error('Schema error:', err);
        reject(err);
      } else {
        console.log('Schema applied');
        resolve();
      }
    });
  });

  // Заполняем данными
  await new Promise((resolve, reject) => {
    console.log('Seeding data...');
    db.exec(seedData, (err) => {
      if (err) {
        console.error('Seed error:', err);
        reject(err);
      } else {
        console.log('Data seeded');
        resolve();
      }
    });
  });

  // Проверяем результат
  await new Promise((resolve, reject) => {
    db.all(`
      SELECT name, COUNT(*) as count 
      FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      GROUP BY name
    `, (err, tables) => {
      if (err) reject(err);
      console.log(`\n Created ${tables.length} tables:`);
      resolve();
    });
  });

  await new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) as count FROM products`, (err, result) => {
      if (err) reject(err);
      console.log(`   Products: ${result.count}`);
      resolve();
    });
  });

  await new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) as count FROM post_processing_services`, (err, result) => {
      if (err) reject(err);
      console.log(`   Operations: ${result.count}`);
      resolve();
    });
  });

  db.close();

  console.log('\n Database initialized successfully!');
  console.log(`Location: ${DB_PATH}`);
  console.log('\n Next steps:');
  console.log('   1. npm start - to start the server');
  console.log('   2. Visit http://localhost:3001/api/products');
}

initDatabase().catch((err) => {
  console.error('\n Initialization failed:', err);
  process.exit(1);
});

