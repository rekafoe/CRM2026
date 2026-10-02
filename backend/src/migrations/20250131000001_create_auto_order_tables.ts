import { Database } from 'sqlite';

export async function up(db: Database) {
  // Таблица правил авто-заказа
  await db.run(`
    CREATE TABLE IF NOT EXISTS auto_order_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      threshold_quantity INTEGER NOT NULL,
      order_quantity INTEGER NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
      UNIQUE(material_id, supplier_id)
    );
  `);

  // Таблица заявок на авто-заказ
  await db.run(`
    CREATE TABLE IF NOT EXISTS auto_order_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT,
      confirmed_at TEXT,
      delivered_at TEXT,
      notes TEXT,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
    );
  `);

  // Таблица шаблонов сообщений
  await db.run(`
    CREATE TABLE IF NOT EXISTS auto_order_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      template TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Индексы для производительности
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_auto_order_rules_material 
    ON auto_order_rules(material_id);
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_auto_order_rules_supplier 
    ON auto_order_rules(supplier_id);
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_auto_order_requests_material 
    ON auto_order_requests(material_id);
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_auto_order_requests_status 
    ON auto_order_requests(status);
  `);

  // Добавляем дефолтный шаблон
  await db.run(`
    INSERT OR IGNORE INTO auto_order_templates (name, template, is_active)
    VALUES (
      'Стандартный заказ',
      'АВТОЗАКАЗ МАТЕРИАЛА\n\n Материал: {material_name}\n Количество: {quantity}\n Поставщик: {supplier_name}\n Дата: {date} {time}\n\n Причина: {reason}\n\nПожалуйста, подтвердите получение заказа.',
      1
    );
  `);

  console.log('Migration 20250131000001_create_auto_order_tables applied: auto order tables created.');
}

export async function down(db: Database) {
  await db.run('DROP TABLE IF EXISTS auto_order_templates;');
  await db.run('DROP TABLE IF EXISTS auto_order_requests;');
  await db.run('DROP TABLE IF EXISTS auto_order_rules;');
  console.log('Migration 20250131000001_create_auto_order_tables reverted: auto order tables dropped.');
}
