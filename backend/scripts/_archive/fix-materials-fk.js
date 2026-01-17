// backend/scripts/fix-materials-fk.js
// Recreate materials table with correct FK to material_categories and copy data

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data.db');

async function run() {
  const db = new sqlite3.Database(DB_PATH);
  const exec = (sql) => new Promise((res, rej) => db.exec(sql, (e) => e ? rej(e) : res()));
  const all = (sql) => new Promise((res, rej) => db.all(sql, (e, r) => e ? rej(e) : res(r)));

  try {
    console.log('🔧 Fixing materials FK to material_categories...');

    const pragma = await all('PRAGMA foreign_keys');
    console.log('PRAGMA foreign_keys =', pragma);

    await exec('PRAGMA foreign_keys=OFF; BEGIN;');

    // Create new table with correct schema and FK
    await exec(`
      CREATE TABLE materials_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        category_id INTEGER,
        unit TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        min_quantity REAL,
        max_stock_level REAL,
        sheet_price_single REAL,
        description TEXT,
        supplier_id INTEGER,
        paper_type_id INTEGER,
        density INTEGER,
        min_stock_level REAL DEFAULT 0,
        location TEXT,
        barcode TEXT,
        sku TEXT,
        notes TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(category_id) REFERENCES material_categories(id),
        FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY(paper_type_id) REFERENCES paper_types(id)
      );
    `);

    // Copy data from old table (use COALESCE to ensure defaults)
    await exec(`
      INSERT INTO materials_new (
        id, name, category_id, unit, quantity, min_quantity, max_stock_level,
        sheet_price_single, description, supplier_id, paper_type_id, density,
        min_stock_level, location, barcode, sku, notes, is_active,
        created_at, updated_at
      )
      SELECT 
        id, name, category_id, unit, COALESCE(quantity, 0), min_quantity, max_stock_level,
        sheet_price_single, description, supplier_id, paper_type_id, density,
        COALESCE(min_stock_level, 0), location, barcode, sku, notes,
        COALESCE(is_active, 1),
        COALESCE(created_at, datetime('now')),
        COALESCE(updated_at, datetime('now'))
      FROM materials;
    `);

    // Swap tables
    await exec(`
      DROP TABLE materials;
      ALTER TABLE materials_new RENAME TO materials;
    `);

    await exec('COMMIT; PRAGMA foreign_keys=ON;');
    console.log('✅ materials table recreated with correct FK.');
  } catch (e) {
    console.error('❌ Failed to fix materials FK:', e);
    try { await exec('ROLLBACK; PRAGMA foreign_keys=ON;'); } catch {}
    process.exit(1);
  } finally {
    db.close();
  }
}

run();
