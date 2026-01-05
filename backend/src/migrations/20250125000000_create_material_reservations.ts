import { Database } from 'sqlite';

export const up = async (db: Database) => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS material_reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'reserved',
      expires_at DATETIME NOT NULL,
      order_id INTEGER,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materials(id),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  try {
    await db.exec(`ALTER TABLE material_reservations ADD COLUMN expires_at DATETIME`);
    console.log('Added missing column material_reservations.expires_at');
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : '';
    if (!message.includes('duplicate column name') && !message.includes('no such table')) {
      throw error;
    }
  }

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_reservations_material_id 
    ON material_reservations(material_id);
  `);
  
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_reservations_status 
    ON material_reservations(status);
  `);
  
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_reservations_expires_at 
    ON material_reservations(expires_at);
  `);
};

export const down = async (db: Database) => {
  await db.exec(`DROP TABLE IF EXISTS material_reservations;`);
};