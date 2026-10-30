import { Database } from 'sqlite'

const CREATE_TEMPLATES = `
  CREATE TABLE document_templates_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('contract', 'act', 'invoice', 'tn')),
    file_path TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`

/** Тип шаблона товарной накладной. Старый CHECK не принимал tn. */
export async function up(db: Database): Promise<void> {
  const exists = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'document_templates'`,
  )
  if (!exists?.name) {
    await db.exec(CREATE_TEMPLATES.replace('document_templates_new', 'document_templates'))
    return
  }
  const schema = await db.get<{ sql?: string }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'document_templates'`,
  )
  if (schema?.sql && schema.sql.includes("'tn'")) return

  await db.exec('PRAGMA foreign_keys = OFF')
  await db.exec(CREATE_TEMPLATES)
  await db.exec(`
    INSERT INTO document_templates_new (id, name, type, file_path, is_default, created_at, updated_at)
    SELECT id, name, type, file_path, is_default, created_at, updated_at
    FROM document_templates
  `)
  await db.exec('DROP TABLE document_templates')
  await db.exec('ALTER TABLE document_templates_new RENAME TO document_templates')
  await db.exec('PRAGMA foreign_keys = ON')
}

export async function down(_db: Database): Promise<void> {
  // Откат CHECK убрал бы уже загруженные бланки ТН.
}
