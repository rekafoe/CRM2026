import { Database } from 'sqlite';

// Adds calculator_type and product_type to products table
export async function up(db: Database): Promise<void> {
  // calculator_type: 'product' | 'operation'
  await db.exec(`
    ALTER TABLE products ADD COLUMN calculator_type TEXT
      CHECK (calculator_type IN ('product','operation','simplified'))
      DEFAULT 'product'
  `).catch(() => {/* column may already exist */});

  // product_type depends on calculator type; keep generic set for now
  await db.exec(`
    ALTER TABLE products ADD COLUMN product_type TEXT
      CHECK (product_type IN (
        'sheet_single','multi_page','universal', -- product calculator
        'sheet_item','multi_page_item'          -- operation calculator (initial)
      ))
  `).catch(() => {/* column may already exist */});
}

export async function down(db: Database): Promise<void> {
  // SQLite cannot drop columns easily; leave no-op for down
  // A real down migration would require table rebuild; intentionally omitted
}


