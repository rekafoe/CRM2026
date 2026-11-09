import type { Database } from 'sqlite'

type ColumnInfo = { name: string }

async function hasColumn(db: Database, table: string, column: string): Promise<boolean> {
  const columns = await db.all<ColumnInfo[]>(`PRAGMA table_info(${table})`)
  return columns.some((item) => item.name === column)
}

export async function up(db: Database): Promise<void> {
  const table = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'design_templates'`,
  )
  if (!table) return

  if (!(await hasColumn(db, 'design_templates', 'uploaded_by_user_id'))) {
    await db.run(
      'ALTER TABLE design_templates ADD COLUMN uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
    )
  }
  await db.run(
    'CREATE INDEX IF NOT EXISTS idx_design_templates_uploaded_by ON design_templates(uploaded_by_user_id)',
  )

  await db.exec(`
    CREATE TABLE IF NOT EXISTS design_template_delete_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      design_template_id INTEGER NOT NULL REFERENCES design_templates(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'pending',
      resolved_by_user_id INTEGER REFERENCES users(id),
      resolved_at TEXT
    )
  `)
  await db.run(
    'CREATE INDEX IF NOT EXISTS idx_design_delete_requests_status ON design_template_delete_requests(status, requested_at)',
  )
  await db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_design_delete_requests_one_pending
    ON design_template_delete_requests(design_template_id)
    WHERE status = 'pending'
  `)
}

export async function down(db: Database): Promise<void> {
  await db.run('DROP INDEX IF EXISTS idx_design_delete_requests_one_pending')
  await db.run('DROP INDEX IF EXISTS idx_design_delete_requests_status')
  await db.run('DROP TABLE IF EXISTS design_template_delete_requests')
  await db.run('DROP INDEX IF EXISTS idx_design_templates_uploaded_by')
}
