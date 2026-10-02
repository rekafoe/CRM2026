import { Database } from 'sqlite'

async function addColumnIfMissing(db: Database, table: string, column: string, definition: string): Promise<void> {
  const cols = (await db.all(`PRAGMA table_info(${table})`)) as Array<{ name: string }>
  if (cols.some((col) => col.name === column)) return
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

/** Наложенный платёж Белпочты: сумма за товар, почтовый сбор остаётся на отправителе. */
export async function up(db: Database): Promise<void> {
  await addColumnIfMissing(db, 'postal_shipments', 'cod_amount', 'REAL')
  await addColumnIfMissing(db, 'postal_shipments', 'declared_value', 'REAL')
}

export async function down(_db: Database): Promise<void> {
  // Суммы наложенного платежа не удаляем: они уже стоят на выписанных бланках.
}
