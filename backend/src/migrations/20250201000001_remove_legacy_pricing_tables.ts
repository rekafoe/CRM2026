import { Database } from 'sqlite';
import { getDb } from '../db';

export async function up(db?: Database): Promise<void> {
  const database = db || await getDb();
  
  // ОТКЛЮЧЕНО: Эта миграция запускалась каждый раз и удаляла данные!
  // Теперь таблицы создаются в initial_schema и enable_flexible_pricing_system
  
  console.log('⏭️ Skipping remove_legacy_pricing_tables - migration already applied or not needed');
  
  // Удаляем только реально устаревшие таблицы, которых точно нет в production
  // await database.exec('DROP TABLE IF EXISTS print_prices');
  // await database.exec('DROP TABLE IF EXISTS product_materials_new');
  // НЕ УДАЛЯЕМ product_operations_link и operation_pricing_rules - они используются!
  
  // await database.exec('DROP TABLE IF EXISTS base_prices');
  // await database.exec('DROP TABLE IF EXISTS urgency_multipliers');
  // await database.exec('DROP TABLE IF EXISTS volume_discounts');
  // await database.exec('DROP TABLE IF EXISTS loyalty_discounts');
}

export async function down(db?: Database): Promise<void> {
  const database = db || await getDb();
  
  // Восстанавливаем старые таблицы (только структуру, без данных)
  await database.exec(`
    CREATE TABLE IF NOT EXISTS print_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      format TEXT NOT NULL,
      print_type TEXT NOT NULL,
      price_per_sheet REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  await database.exec(`
    CREATE TABLE IF NOT EXISTS product_materials_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      material_id INTEGER NOT NULL,
      qty_per_sheet REAL NOT NULL,
      is_required INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (material_id) REFERENCES materials(id)
    )
  `);
  
  await database.exec(`
    CREATE TABLE IF NOT EXISTS product_operations_link (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      operation_id INTEGER NOT NULL,
      is_required INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (operation_id) REFERENCES post_processing_services(id)
    )
  `);
  
  await database.exec(`
    CREATE TABLE IF NOT EXISTS operation_pricing_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id INTEGER NOT NULL,
      rule_type TEXT NOT NULL,
      rule_name TEXT NOT NULL,
      rule_value REAL NOT NULL,
      conditions TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (operation_id) REFERENCES post_processing_services(id)
    )
  `);
}
