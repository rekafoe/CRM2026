import { Database } from 'sqlite'

const SIGNER_COLUMNS = [
  'signer_position',
  'signer_position_genitive',
  'signer_name',
  'signer_name_genitive',
  'authority_basis',
] as const

/**
 * Подписант юрлица отдельными полями.
 * authorized_person остаётся строкой «ФИО, действует на основании: …» для старых шаблонов.
 */
export async function up(db: Database): Promise<void> {
  const columns = (await db.all("PRAGMA table_info('customers')")) as Array<{ name: string }>
  const names = new Set(columns.map((column) => column.name))
  for (const column of SIGNER_COLUMNS) {
    if (!names.has(column)) {
      await db.run(`ALTER TABLE customers ADD COLUMN ${column} TEXT`)
    }
  }
}

export async function down(db: Database): Promise<void> {
  for (const column of [...SIGNER_COLUMNS].reverse()) {
    try {
      await db.run(`ALTER TABLE customers DROP COLUMN ${column}`)
    } catch {
      // SQLite без DROP COLUMN оставляет поля.
    }
  }
}
