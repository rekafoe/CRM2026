import { Database } from 'sqlite';

/**
 * Миграция: Создание таблицы product_material_rules
 * 
 * Таблица для хранения правил материалов для разных типов продуктов
 */
export async function up(db: Database): Promise<void> {
  // Создаём таблицу product_material_rules
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_material_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_type TEXT NOT NULL,
      product_name TEXT,
      material_id INTEGER NOT NULL,
      qty_per_item REAL NOT NULL DEFAULT 0,
      calculation_type TEXT NOT NULL DEFAULT 'per_item' CHECK (calculation_type IN ('per_item', 'per_sheet', 'per_sqm', 'fixed')),
      is_required INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE CASCADE,
      UNIQUE(product_type, product_name, material_id)
    )
  `);

  // Создаём индексы для оптимизации запросов
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_product_material_rules_type 
    ON product_material_rules(product_type)
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_product_material_rules_name 
    ON product_material_rules(product_name)
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_product_material_rules_material 
    ON product_material_rules(material_id)
  `);

  console.log('✅ Создана таблица product_material_rules');
}

export async function down(db: Database): Promise<void> {
  await db.exec(`DROP TABLE IF EXISTS product_material_rules`);
  console.log('✅ Удалена таблица product_material_rules');
}

