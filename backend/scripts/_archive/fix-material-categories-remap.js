// backend/scripts/fix-material-categories-remap.js
// Recreate material_categories with AUTOINCREMENT PK, deduplicate by name,
// remap materials.category_id by category name, and swap tables

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data.db');

async function run() {
  const db = new sqlite3.Database(DB_PATH);
  const exec = (sql) => new Promise((res, rej) => db.exec(sql, (e) => e ? rej(e) : res()));
  const all = (sql) => new Promise((res, rej) => db.all(sql, (e, r) => e ? rej(e) : res(r)));

  try {
    console.log('🔧 Rebuilding material_categories with PK and remapping materials...');

    await exec('PRAGMA foreign_keys=OFF; BEGIN;');

    // Create new categories table with PK
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

    // Insert deduplicated categories by name (keep first non-null values)
    await exec(`
      INSERT INTO material_categories_new (name, description, icon, color, sort_order, created_at)
      SELECT 
        name,
        MIN(description),
        MIN(icon),
        MIN(color),
        COALESCE(MIN(sort_order), 0),
        COALESCE(MIN(created_at), datetime('now'))
      FROM material_categories
      GROUP BY name;
    `);

    // Build temporary mapping table old_name -> new_id
    await exec(`
      CREATE TEMP TABLE category_name_map AS
      SELECT oc.name as old_name, nc.id as new_id
      FROM (SELECT DISTINCT name FROM material_categories) oc
      JOIN material_categories_new nc ON nc.name = oc.name;
    `);

    // Remap materials.category_id using names
    // Create a temp table mapping old category_id -> new_id via name
    await exec(`
      CREATE TEMP TABLE category_id_map AS
      SELECT oc.id as old_id, cnm.new_id as new_id
      FROM material_categories oc
      JOIN category_name_map cnm ON cnm.old_name = oc.name;
    `);

    // Update materials.category_id to new ids where mapping exists
    await exec(`
      UPDATE materials
      SET category_id = (
        SELECT new_id FROM category_id_map m WHERE m.old_id = materials.category_id
      )
      WHERE category_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM category_id_map m WHERE m.old_id = materials.category_id
      );
    `);

    // Replace old categories table
    await exec(`
      DROP TABLE material_categories;
      ALTER TABLE material_categories_new RENAME TO material_categories;
    `);

    await exec('COMMIT; PRAGMA foreign_keys=ON;');

    // Show results
    const tiAfter = await all('PRAGMA table_info(material_categories)');
    console.log('After table_info(material_categories):', tiAfter);
    const countCat = await all('SELECT COUNT(*) as c FROM material_categories');
    console.log('Categories count:', countCat[0].c);

    console.log('✅ material_categories rebuilt and materials remapped.');
  } catch (e) {
    console.error('❌ Failed to rebuild material_categories:', e);
    try { await exec('ROLLBACK; PRAGMA foreign_keys=ON;'); } catch {}
    process.exit(1);
  } finally {
    db.close();
  }
}

run();
