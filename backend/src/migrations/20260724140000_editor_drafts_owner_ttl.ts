import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`ALTER TABLE editor_drafts ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL`)
  await db.exec(`ALTER TABLE editor_drafts ADD COLUMN guest_token TEXT`)
  await db.exec(`ALTER TABLE editor_drafts ADD COLUMN expires_at TEXT`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_editor_drafts_customer_id ON editor_drafts(customer_id)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_editor_drafts_guest_token ON editor_drafts(guest_token)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_editor_drafts_expires_at ON editor_drafts(expires_at)`)
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_editor_drafts_expires_at')
  await db.exec('DROP INDEX IF EXISTS idx_editor_drafts_guest_token')
  await db.exec('DROP INDEX IF EXISTS idx_editor_drafts_customer_id')
}
