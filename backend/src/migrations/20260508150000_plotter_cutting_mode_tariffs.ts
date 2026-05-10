import { Database } from 'sqlite';

/**
 * Тарифы плоттерной резки: ровно два режима (рулон / лист), отдельно от post_processing_services.
 */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS plotter_cutting_mode_tariffs (
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
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const rowCount = await db.get<{ c: number }>(
    `SELECT COUNT(*) as c FROM plotter_cutting_mode_tariffs`
  );
  if ((rowCount?.c ?? 0) >= 2) {
    return;
  }

  const knifeBasis = 'knife_path';

  const rollSvc = await db.get<{ price: number; min_quantity: number | null }>(
    `SELECT price, min_quantity FROM post_processing_services 
     WHERE operation_type = 'plotter_cut' AND LOWER(name) LIKE '%рулон%' LIMIT 1`
  );
  const sheetSvc = await db.get<{ price: number; min_quantity: number | null }>(
    `SELECT price, min_quantity FROM post_processing_services 
     WHERE operation_type = 'plotter_cut' AND LOWER(name) LIKE '%лист%' LIMIT 1`
  );

  const rollPrice = rollSvc != null ? Number(rollSvc.price ?? 0) : 1;
  const sheetPrice = sheetSvc != null ? Number(sheetSvc.price ?? 0) : 1;
  const rollMin = rollSvc?.min_quantity != null ? Number(rollSvc.min_quantity) : 1;
  const sheetMin = sheetSvc?.min_quantity != null ? Number(sheetSvc.min_quantity) : 1;

  await db.run(
    `INSERT OR REPLACE INTO plotter_cutting_mode_tariffs (
      mode, label, price_per_meter, meter_basis, min_quantity, volume_tiers_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, datetime('now'))`,
    'roll',
    'Плоттерная резка (рулон)',
    rollPrice,
    knifeBasis,
    Number.isFinite(rollMin) && rollMin > 0 ? rollMin : 1
  );
  await db.run(
    `INSERT OR REPLACE INTO plotter_cutting_mode_tariffs (
      mode, label, price_per_meter, meter_basis, min_quantity, volume_tiers_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, datetime('now'))`,
    'sheet',
    'Плоттерная резка (лист)',
    sheetPrice,
    knifeBasis,
    Number.isFinite(sheetMin) && sheetMin > 0 ? sheetMin : 1
  );
}

export async function down(db: Database): Promise<void> {
  await db.exec(`DROP TABLE IF EXISTS plotter_cutting_mode_tariffs`);
}
