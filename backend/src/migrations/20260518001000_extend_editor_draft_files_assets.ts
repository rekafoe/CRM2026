import { Database } from 'sqlite'

async function addColumnIfMissing(db: Database, table: string, column: string, definition: string): Promise<void> {
  const rows = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${table})`)
  if (rows.some((row) => row.name === column)) return
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

export async function up(db: Database): Promise<void> {
  await addColumnIfMissing(db, 'editor_drafts', 'version', 'version INTEGER NOT NULL DEFAULT 1')
  await addColumnIfMissing(db, 'editor_draft_files', 'width', 'width INTEGER')
  await addColumnIfMissing(db, 'editor_draft_files', 'height', 'height INTEGER')
  await addColumnIfMissing(db, 'editor_draft_files', 'thumbFilename', 'thumbFilename TEXT')
  await addColumnIfMissing(db, 'editor_draft_files', 'uploadStatus', "uploadStatus TEXT DEFAULT 'ready'")
  await addColumnIfMissing(db, 'editor_draft_files', 'uploadError', 'uploadError TEXT')
}

export async function down(_db: Database): Promise<void> {
  // SQLite не поддерживает безопасное DROP COLUMN без пересборки таблицы.
}
