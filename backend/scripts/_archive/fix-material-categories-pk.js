// backend/scripts/fix-material-categories-pk.js
// Recreate material_categories with PRIMARY KEY(id) and copy data to fix FK mismatch

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data.db');

async function run() {
  const db = new sqlite3.Database(DB_PATH);
  const exec = (sql) => new Promise((res, rej) => db.exec(sql, (e) => e ? rej(e) : res()));
  const all = (sql) => new Promise((res, rej) => db.all(sql, (e, r) => e ? rej(e) : res(r)));

  try {
    console.log('🔧 Fixing material_categories: adding PRIMARY KEY(id)...');

    const tiBefore = await all('PRAGMA table_info(material_categories)');
    console.log('Before table_info(material_categories):', tiBefore);

    await exec('PRAGMA foreign_keys=OFF; BEGIN;');

    await exec(`
      CREATE TABLE material_categories_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        icon TEXT,
        color TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    await exec(`
      INSERT INTO material_categories_new (id, name, description, icon, color, sort_order, created_at)
      SELECT id, name, description, icon, color, COALESCE(sort_order, 0), COALESCE(created_at, datetime('now'))
      FROM material_categories;
    `);

    await exec(`
      DROP TABLE material_categories;
      ALTER TABLE material_categories_new RENAME TO material_categories;
    `);

    await exec('COMMIT; PRAGMA foreign_keys=ON;');

    const tiAfter = await all('PRAGMA table_info(material_categories)');
    console.log('After table_info(material_categories):', tiAfter);
    console.log('✅ material_categories fixed.');
  } catch (e) {
    console.error('❌ Failed to fix material_categories:', e);
    try { await exec('ROLLBACK; PRAGMA foreign_keys=ON;'); } catch {}
    process.exit(1);
  } finally {
    db.close();
  }
}

run();
