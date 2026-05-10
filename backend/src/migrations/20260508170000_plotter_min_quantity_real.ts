import { Database } from 'sqlite';

/**
 * min_quantity тарифа плоттера: дробные п.м. (например 0,3) — колонка REAL вместо INTEGER.
 */
export async function up(db: Database): Promise<void> {
  const cols = (await db.all(
    `PRAGMA table_info(plotter_cutting_mode_tariffs)`
  )) as Array<{ name: string; type: string }>;
  if (cols.length === 0) return;
  const minCol = cols.find((c) => c.name === 'min_quantity');
  if (minCol && String(minCol.type).toUpperCase() === 'REAL') {
    return;
  }

  await db.exec('BEGIN');
  try {
    await db.exec(`
      CREATE TABLE plotter_cutting_mode_tariffs__minreal (
        mode TEXT PRIMARY KEY CHECK (mode IN ('roll', 'sheet')),
        label TEXT NOT NULL DEFAULT '',
        price_per_meter REAL NOT NULL DEFAULT 0,
        meter_basis TEXT NOT NULL DEFAULT 'knife_path' CHECK (meter_basis IN ('knife_path', 'feed')),
        min_quantity REAL NOT NULL DEFAULT 1,
        max_quantity INTEGER,
        operator_percent REAL,
        material_id INTEGER,
        qty_per_item REAL,
        volume_tiers_json TEXT,
        cut_level_rules_json TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await db.exec(`
      INSERT INTO plotter_cutting_mode_tariffs__minreal (
        mode, label, price_per_meter, meter_basis, min_quantity, max_quantity,
        operator_percent, material_id, qty_per_item, volume_tiers_json, cut_level_rules_json, updated_at
      )
      SELECT
        mode, label, price_per_meter, meter_basis,
        CAST(min_quantity AS REAL),
        max_quantity, operator_percent, material_id, qty_per_item, volume_tiers_json,
        cut_level_rules_json, updated_at
      FROM plotter_cutting_mode_tariffs
    `);
    await db.exec('DROP TABLE plotter_cutting_mode_tariffs');
    await db.exec(
      'ALTER TABLE plotter_cutting_mode_tariffs__minreal RENAME TO plotter_cutting_mode_tariffs'
    );
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

export async function down(db: Database): Promise<void> {
  const cols = (await db.all(
    `PRAGMA table_info(plotter_cutting_mode_tariffs)`
  )) as Array<{ name: string; type: string }>;
  if (cols.length === 0) return;
  const minCol = cols.find((c) => c.name === 'min_quantity');
  if (!minCol || String(minCol.type).toUpperCase() !== 'REAL') {
    return;
  }

  await db.exec('BEGIN');
  try {
    await db.exec(`
      CREATE TABLE plotter_cutting_mode_tariffs__minint (
        mode TEXT PRIMARY KEY CHECK (mode IN ('roll', 'sheet')),
        label TEXT NOT NULL DEFAULT '',
        price_per_meter REAL NOT NULL DEFAULT 0,
        meter_basis TEXT NOT NULL DEFAULT 'knife_path' CHECK (meter_basis IN ('knife_path', 'feed')),
        min_quantity INTEGER DEFAULT 1,
        max_quantity INTEGER,
        operator_percent REAL,
        material_id INTEGER,
        qty_per_item REAL,
        volume_tiers_json TEXT,
        cut_level_rules_json TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await db.exec(`
      INSERT INTO plotter_cutting_mode_tariffs__minint (
        mode, label, price_per_meter, meter_basis, min_quantity, max_quantity,
        operator_percent, material_id, qty_per_item, volume_tiers_json, cut_level_rules_json, updated_at
      )
      SELECT
        mode, label, price_per_meter, meter_basis,
        CAST(ROUND(min_quantity) AS INTEGER),
        max_quantity, operator_percent, material_id, qty_per_item, volume_tiers_json,
        cut_level_rules_json, updated_at
      FROM plotter_cutting_mode_tariffs
    `);
    await db.exec('DROP TABLE plotter_cutting_mode_tariffs');
    await db.exec(
      'ALTER TABLE plotter_cutting_mode_tariffs__minint RENAME TO plotter_cutting_mode_tariffs'
    );
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}
