import { Database } from 'sqlite';

/**
 * Таблица типов цен (price types) для управления скидками/наценками.
 * standard и online — всегда доступны по умолчанию, остальные настраиваются для продукта.
 */
export async function up(db: Database) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS price_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      multiplier REAL NOT NULL DEFAULT 1,
      production_days INTEGER DEFAULT 3,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const row = await db.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM price_types`);
  const count = Number(row?.cnt ?? 0);
  if (count > 0) return;

  const seeds: Array<{ key: string; name: string; multiplier: number; production_days: number; description: string; sort_order: number; is_system: number }> = [
    { key: 'standard', name: 'Стандартная', multiplier: 1, production_days: 3, description: 'Базовая цена (×1)', sort_order: 0, is_system: 1 },
    { key: 'online', name: 'Онлайн', multiplier: 0.825, production_days: 3, description: 'Скидка −17,5%', sort_order: 1, is_system: 1 },
    { key: 'urgent', name: 'Срочно', multiplier: 1.5, production_days: 1, description: 'Наценка +50%', sort_order: 2, is_system: 0 },
    { key: 'promo', name: 'Промо', multiplier: 0.7, production_days: 5, description: 'Скидка −30%', sort_order: 3, is_system: 0 },
    { key: 'special', name: 'Спец.предложение', multiplier: 0.55, production_days: 7, description: 'Скидка −45%', sort_order: 4, is_system: 0 },
  ];

  for (const s of seeds) {
    await db.run(
      `INSERT INTO price_types (key, name, multiplier, production_days, description, sort_order, is_system, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
      [s.key, s.name, s.multiplier, s.production_days, s.description, s.sort_order, s.is_system]
    );
  }
}

export async function down(db: Database) {
  await db.exec(`DROP TABLE IF EXISTS price_types`);
}
