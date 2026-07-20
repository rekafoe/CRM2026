import { Database } from 'sqlite'

type ColumnInfo = { name: string }

async function ensureColumn(db: Database, table: string, name: string, ddl: string): Promise<void> {
  const columns = (await db.all(`PRAGMA table_info(${table})`)) as ColumnInfo[]
  if (columns.some((c) => c.name === name)) return
  await db.exec(ddl)
}

function formatDesignCode(n: number): string {
  return String(n).padStart(6, '0')
}

/**
 * Семейство дизайна: общий 6-значный design_code (000001–999999) на несколько
 * вариантов размера (отдельные строки design_templates).
 */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS design_code_seq (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next_code INTEGER NOT NULL DEFAULT 1
    )
  `)

  const seq = await db.get<{ next_code: number }>('SELECT next_code FROM design_code_seq WHERE id = 1')
  if (!seq) {
    await db.run('INSERT INTO design_code_seq (id, next_code) VALUES (1, 1)')
  }

  await ensureColumn(
    db,
    'design_templates',
    'design_code',
    "ALTER TABLE design_templates ADD COLUMN design_code TEXT NOT NULL DEFAULT ''",
  )

  const rows = (await db.all(
    `SELECT id FROM design_templates WHERE design_code IS NULL OR design_code = '' ORDER BY id ASC`,
  )) as Array<{ id: number }>

  let next = Number(
    (await db.get<{ next_code: number }>('SELECT next_code FROM design_code_seq WHERE id = 1'))?.next_code ?? 1,
  )
  if (!Number.isFinite(next) || next < 1) next = 1

  for (const row of rows) {
    if (next > 999999) {
      throw new Error('design_code_seq exhausted: cannot allocate beyond 999999')
    }
    const code = formatDesignCode(next)
    await db.run(
      `UPDATE design_templates SET design_code = ?, name = CASE
         WHEN name IS NULL OR TRIM(name) = '' THEN ?
         ELSE name
       END
       WHERE id = ?`,
      [code, code, row.id],
    )
    next += 1
  }

  await db.run('UPDATE design_code_seq SET next_code = ? WHERE id = 1', [next])

  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_design_templates_design_code ON design_templates(design_code)',
  )
}

export async function down(_db: Database): Promise<void> {
  console.log('ℹ️ down() skipped: SQLite does not support DROP COLUMN easily')
}
