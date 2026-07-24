import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`ALTER TABLE customer_projects ADD COLUMN product_id INTEGER`)
  await db.exec(`ALTER TABLE customer_projects ADD COLUMN type_id INTEGER`)
  await db.exec(`ALTER TABLE customer_projects ADD COLUMN size_id TEXT`)
  await db.exec(`ALTER TABLE customer_projects ADD COLUMN resume_json TEXT`)
}

export async function down(db: Database): Promise<void> {
  // SQLite cannot drop columns portably — leave columns.
}
