import { Database } from 'sqlite';

/**
 * Учёт документов, выданных юридическим лицам: дата формирования, возврат к нам.
 */
export async function up(db: Database): Promise<void> {
  await db.run(`
    CREATE TABLE IF NOT EXISTS customer_legal_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      document_kind TEXT,
      issued_at TEXT NOT NULL,
      returned_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )
  `);
  await db.run(
    `CREATE INDEX IF NOT EXISTS idx_customer_legal_documents_customer_id ON customer_legal_documents(customer_id)`,
  );
}
