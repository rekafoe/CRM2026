exports.up = async (db: any) => {
  await db.run(`
    CREATE TABLE IF NOT EXISTS low_stock_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      current_quantity REAL NOT NULL,
      min_quantity REAL NOT NULL,
      alert_level TEXT NOT NULL CHECK (alert_level IN ('warning', 'critical', 'out_of_stock')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_resolved BOOLEAN DEFAULT 0,
      resolved_at DATETIME,
      resolved_by INTEGER,
      FOREIGN KEY (material_id) REFERENCES materials(id),
      FOREIGN KEY (resolved_by) REFERENCES users(id)
    );
  `);

  await db.run(`CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_material_id ON low_stock_alerts (material_id);`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_alert_level ON low_stock_alerts (alert_level);`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_is_resolved ON low_stock_alerts (is_resolved);`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_created_at ON low_stock_alerts (created_at);`);
  
  console.log('Migration 20250127000000_create_low_stock_alerts applied');
};

exports.down = async (db: any) => {
  await db.run(`DROP TABLE IF EXISTS low_stock_alerts;`);
  console.log('Migration 20250127000000_create_low_stock_alerts rolled back');
};
