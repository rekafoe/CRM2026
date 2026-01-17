// backend/scripts/inspect-fk.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data.db');

async function run() {
  const db = new sqlite3.Database(DB_PATH);
  const all = (sql) => new Promise((res, rej) => db.all(sql, (e, r) => e ? rej(e) : res(r)));
  try {
    const master = await all(`SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('materials','material_categories')`);
    console.log('sqlite_master entries:');
    for (const row of master) console.log(row);
    const fk = await all('PRAGMA foreign_key_list(materials)');
    console.log('PRAGMA foreign_key_list(materials):');
    console.log(fk);
    const tiMat = await all('PRAGMA table_info(materials)');
    const tiCat = await all('PRAGMA table_info(material_categories)');
    console.log('table_info(materials):', tiMat);
    console.log('table_info(material_categories):', tiCat);
  } catch (e) {
    console.error(e);
  } finally {
    db.close();
  }
}

run();
