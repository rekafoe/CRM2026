import { Database } from 'sqlite'

export async function up(db: Database) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_order_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      total_orders INTEGER DEFAULT 0,
      completed_orders INTEGER DEFAULT 0,
      total_revenue INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, date)
    );
    
    CREATE TABLE IF NOT EXISTS user_order_page_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      order_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      notes TEXT,
      FOREIGN KEY (page_id) REFERENCES user_order_pages (id) ON DELETE CASCADE,
      UNIQUE(order_id, order_type)
    );
    
    CREATE INDEX IF NOT EXISTS idx_user_order_pages_user_date ON user_order_pages (user_id, date);
    CREATE INDEX IF NOT EXISTS idx_user_order_page_orders_page ON user_order_page_orders (page_id);
    CREATE INDEX IF NOT EXISTS idx_user_order_page_orders_order ON user_order_page_orders (order_id, order_type);
  `)
}

export async function down(db: Database) {
  await db.exec(`
    DROP TABLE IF EXISTS user_order_page_orders;
    DROP TABLE IF EXISTS user_order_pages;
  `)
}


