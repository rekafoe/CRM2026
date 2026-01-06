import { Database } from 'sqlite'

export async function up(db: Database) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS photo_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      username TEXT,
      first_name TEXT,
      status TEXT DEFAULT 'pending',
      original_photos TEXT DEFAULT '[]',
      processed_photos TEXT DEFAULT '[]',
      selected_size TEXT NOT NULL,
      processing_options TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      total_price INTEGER NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_photo_orders_chat_id ON photo_orders (chat_id);
    CREATE INDEX IF NOT EXISTS idx_photo_orders_status ON photo_orders (status);
  `)
}

export async function down(db: Database) {
  await db.exec(`
    DROP TABLE IF EXISTS photo_orders;
  `)
}


