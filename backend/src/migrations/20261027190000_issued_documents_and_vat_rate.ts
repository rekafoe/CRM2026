import { Database } from 'sqlite'

/**
 * Выданные документы хранятся целиком. Номер занимается счётчиком и не переиспользуется.
 * Ставка НДС организации: пусто — без НДС.
 */
export async function up(db: Database): Promise<void> {
  const orgCols = (await db.all("PRAGMA table_info('organizations')")) as Array<{ name: string }>
  if (!orgCols.some((column) => column.name === 'vat_rate')) {
    await db.run('ALTER TABLE organizations ADD COLUMN vat_rate REAL')
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS document_number_counters (
      kind TEXT PRIMARY KEY,
      last_value INTEGER NOT NULL
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS issued_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      number TEXT NOT NULL,
      customer_id INTEGER,
      organization_id INTEGER,
      order_key TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      total_amount REAL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_blob BLOB NOT NULL,
      issued_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (kind, number),
      UNIQUE (kind, order_key, source_hash)
    )
  `)

  const legalCols = (await db.all("PRAGMA table_info('customer_legal_documents')")) as Array<{ name: string }>
  if (legalCols.length > 0) {
    if (!legalCols.some((column) => column.name === 'issued_document_id')) {
      await db.run('ALTER TABLE customer_legal_documents ADD COLUMN issued_document_id INTEGER')
    }
    await db.exec(
      'CREATE INDEX IF NOT EXISTS idx_customer_legal_documents_issued ON customer_legal_documents(issued_document_id)',
    )
  }
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_customer_legal_documents_issued')
  await db.exec('DROP TABLE IF EXISTS issued_documents')
  await db.exec('DROP TABLE IF EXISTS document_number_counters')
}
