import { Database } from 'sqlite';

export async function up(db: Database): Promise<void> {
  // Таблица аудита складских операций
  await db.exec(`
    CREATE TABLE IF NOT EXISTS warehouse_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_type TEXT NOT NULL, -- 'spend', 'add', 'adjust', 'reserve', 'unreserve'
      material_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      old_quantity REAL NOT NULL,
      new_quantity REAL NOT NULL,
      reason TEXT NOT NULL,
      order_id INTEGER,
      user_id INTEGER,
      metadata TEXT, -- JSON с дополнительными данными
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE CASCADE,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Индексы для оптимизации запросов аудита
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_warehouse_audit_material_id 
    ON warehouse_audit_log(material_id)
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_warehouse_audit_operation_type 
    ON warehouse_audit_log(operation_type)
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_warehouse_audit_created_at 
    ON warehouse_audit_log(created_at)
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_warehouse_audit_order_id 
    ON warehouse_audit_log(order_id)
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_warehouse_audit_user_id 
    ON warehouse_audit_log(user_id)
  `);

  // Таблица для блокировок (предотвращение race conditions)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS warehouse_locks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_type TEXT NOT NULL, -- 'material', 'order', 'reservation'
      resource_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      locked_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      UNIQUE(resource_type, resource_id)
    )
  `);

  // Индекс для блокировок
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_warehouse_locks_resource 
    ON warehouse_locks(resource_type, resource_id)
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_warehouse_locks_expires 
    ON warehouse_locks(expires_at)
  `);
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP TABLE IF EXISTS warehouse_locks');
  await db.exec('DROP TABLE IF EXISTS warehouse_audit_log');
}
