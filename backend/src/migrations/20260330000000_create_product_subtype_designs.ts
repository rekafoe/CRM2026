import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_subtype_designs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type_id INTEGER NOT NULL,
      design_template_id INTEGER NOT NULL REFERENCES design_templates(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(product_id, type_id, design_template_id)
    )
  `)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_psd_product_type ON product_subtype_designs(product_id, type_id)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_psd_design_template ON product_subtype_designs(design_template_id)`)
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_psd_design_template')
  await db.exec('DROP INDEX IF EXISTS idx_psd_product_type')
  await db.exec('DROP TABLE IF EXISTS product_subtype_designs')
}
