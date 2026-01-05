import { Database } from 'sqlite';

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS print_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technology_code TEXT NOT NULL,
      counter_unit TEXT CHECK(counter_unit IN ('sheets','meters')) NOT NULL DEFAULT 'sheets',
      price_bw_single REAL,
      price_bw_duplex REAL,
      price_color_single REAL,
      price_color_duplex REAL,
      price_bw_per_meter REAL,
      price_color_per_meter REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_print_prices_technology_active
      ON print_prices (technology_code, is_active);
  `);
}

export async function down(db: Database): Promise<void> {
  await db.exec(`DROP TABLE IF EXISTS print_prices;`);
}

