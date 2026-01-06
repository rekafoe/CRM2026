import { Database } from 'sqlite'

/**
 * Расширяем CHECK-constraint для products.calculator_type, чтобы разрешить 'simplified'.
 *
 * В некоторых БД колонка calculator_type была добавлена через ALTER TABLE с CHECK ('product','operation'),
 * что блокирует запись значения 'simplified'. SQLite не умеет ALTER CHECK, поэтому делаем rebuild таблицы
 * только если реально обнаружили старый CHECK.
 */
export async function up(db: Database): Promise<void> {
  const row = await db.get<{ sql?: string | null }>(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='products'`
  )
  const createSql = row?.sql || ''

  // Если CHECK нет или уже включает simplified — ничего не делаем
  const oldCheck = "CHECK (calculator_type IN ('product','operation'))"
  const newCheck = "CHECK (calculator_type IN ('product','operation','simplified'))"
  if (!createSql.includes(oldCheck) || createSql.includes("'simplified'")) {
    return
  }

  const newCreateSql = createSql.replace(oldCheck, newCheck)

  // Rebuild таблицы
  await db.exec(`PRAGMA foreign_keys = OFF;`)
  await db.exec(`ALTER TABLE products RENAME TO products_old;`)
  await db.exec(newCreateSql)

  const cols = await db.all<Array<{ name: string }>>(`PRAGMA table_info(products_old)`)
  const colNames = (cols || []).map(c => c.name).filter(Boolean)
  if (colNames.length === 0) {
    // На всякий случай: если не смогли прочитать колонки, откатываемся
    await db.exec(`DROP TABLE IF EXISTS products;`)
    await db.exec(`ALTER TABLE products_old RENAME TO products;`)
    await db.exec(`PRAGMA foreign_keys = ON;`)
    return
  }

  const colList = colNames.map(n => `"${n}"`).join(', ')
  await db.exec(`INSERT INTO products (${colList}) SELECT ${colList} FROM products_old;`)
  await db.exec(`DROP TABLE products_old;`)
  await db.exec(`PRAGMA foreign_keys = ON;`)
}

export async function down(_db: Database): Promise<void> {
  // Down не делаем: SQLite не умеет безопасно "сузить" CHECK без rebuild, и это может потерять данные.
}


