import { Database } from 'sqlite'

/** Кредит юрлица: менеджер зачисляет поступление и прикладывает подтверждение. */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS customer_legal_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      paid_at TEXT NOT NULL,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_customer_legal_payments_customer ON customer_legal_payments(customer_id)',
  )
  await db.exec(`
    CREATE TABLE IF NOT EXISTS customer_legal_payment_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime TEXT,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_customer_legal_payment_files_payment ON customer_legal_payment_files(payment_id)',
  )
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP TABLE IF EXISTS customer_legal_payment_files')
  await db.exec('DROP TABLE IF EXISTS customer_legal_payments')
}
