#!/usr/bin/env node
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../data.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function (err, rows) {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

(async () => {
  try {
    console.log('Seeding suppliers and materials...');
    await run("INSERT OR IGNORE INTO suppliers (id, name, contact_person, phone, email, address, notes, is_active) VALUES (1,'Поставщик А','Иван','+375291112233','printcorecenter@gmail.com','Минск, Логойский тракт 1','Тестовый поставщик А',1)");
    await run("INSERT OR IGNORE INTO suppliers (id, name, contact_person, phone, email, address, notes, is_active) VALUES (2,'Поставщик Б','Петр','+375291112244','printcorecenter@gmail.com','Минск, Притыцкого 2','Тестовый поставщик Б',1)");

    await run("INSERT INTO materials (name, unit, quantity, min_quantity, sheet_price_single, category_id, supplier_id, description) VALUES ('Бумага A4 80г','шт',50,30,0.12,NULL,1,'Тестовая бумага')");
    await run("INSERT INTO materials (name, unit, quantity, min_quantity, sheet_price_single, category_id, supplier_id, description) VALUES ('Бумага A3 130г','шт',20,15,0.35,NULL,2,'Тестовая бумага A3')");

    const mats = await all('SELECT id, name, supplier_id FROM materials ORDER BY id DESC LIMIT 2');
    console.log('✅ Seeded materials:', mats);
  } catch (e) {
    console.error('Seed error:', e.message);
    process.exit(1);
  } finally {
    db.close();
  }
})();


