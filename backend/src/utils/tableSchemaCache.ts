import { getDb } from '../config/database'

const TTL_MS = 5 * 60 * 1000 // 5 минут

const cache = new Map<string, Set<string>>()
const cacheTime = new Map<string, number>()

/**
 * Возвращает множество имён колонок таблицы (кешируется).
 */
export async function getTableColumns(table: string): Promise<Set<string>> {
  const key = table.toLowerCase()
  const now = Date.now()
  const cached = cache.get(key)
  const cachedTime = cacheTime.get(key)

  if (cached != null && cachedTime != null && now - cachedTime < TTL_MS) {
    return cached
  }

  const db = await getDb()
  const rows = await db.all<Array<{ name: string }>>(
    `PRAGMA table_info(${sanitizeTableName(table)})`
  )
  const columns = new Set((rows || []).map((r) => r.name))

  cache.set(key, columns)
  cacheTime.set(key, now)
  return columns
}

/**
 * Проверяет наличие колонки в таблице (кешируется).
 */
export async function hasColumn(table: string, column: string): Promise<boolean> {
  const columns = await getTableColumns(table)
  return columns.has(column)
}

/**
 * Сбрасывает кеш (вызывать после миграций, если они выполняются в рантайме).
 */
export function invalidateTableSchemaCache(table?: string): void {
  if (table) {
    cache.delete(table.toLowerCase())
    cacheTime.delete(table.toLowerCase())
  } else {
    cache.clear()
    cacheTime.clear()
  }
}

function sanitizeTableName(name: string): string {
  // только буквы, цифры, подчёркивание — защита от инъекций
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid table name: ${name}`)
  }
  return name
}
