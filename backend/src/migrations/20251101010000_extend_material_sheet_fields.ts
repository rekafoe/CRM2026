import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  console.log('⬆️ Adding sheet and printable fields to materials...')

  const addColumn = async (sql: string) => {
    try {
      await db.exec(sql)
    } catch (error: any) {
      if (typeof error?.message === 'string' && error.message.includes('duplicate column name')) {
        console.log('Column already exists, skipping...')
      } else {
        throw error
      }
    }
  }

  await addColumn(`ALTER TABLE materials ADD COLUMN sheet_width REAL`)
  await addColumn(`ALTER TABLE materials ADD COLUMN sheet_height REAL`)
  await addColumn(`ALTER TABLE materials ADD COLUMN printable_width REAL`)
  await addColumn(`ALTER TABLE materials ADD COLUMN printable_height REAL`)
  await addColumn(`ALTER TABLE materials ADD COLUMN finish TEXT`)

  // Helpful indexes for filtering by finish and sizing if needed
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_materials_finish ON materials(finish)`)
}

export async function down(db: Database): Promise<void> {
  console.log('⬇️ Reverting added sheet/printable fields on materials (SQLite limitation: recreating table)')

  // SQLite does not support DROP COLUMN; recreate table without the added columns
  await db.exec(`
    PRAGMA foreign_keys=off;
    BEGIN TRANSACTION;
    CREATE TABLE materials_tmp AS 
      SELECT id, name, category_id, unit, quantity, min_quantity, max_stock_level,
             sheet_price_single, description, supplier_id, paper_type_id, density,
             min_stock_level, location, barcode, sku, notes, is_active,
             created_at, updated_at
      FROM materials;
    DROP TABLE materials;
    ALTER TABLE materials_tmp RENAME TO materials;
    COMMIT;
    PRAGMA foreign_keys=on;
  `)

  await db.exec('DROP INDEX IF EXISTS idx_materials_finish')
}


