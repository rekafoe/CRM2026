/** Лимит выдачи поиска в пуле: хватает на редкий телефон/УНП, без выгрузки всей таблицы. */
export const ORDER_POOL_SEARCH_LIMIT = 500
export const ORDER_SEARCH_MAX_LIMIT = 10000

export function clampOrderSearchLimit(limit: number | undefined): number | undefined {
  if (limit == null || !Number.isFinite(limit)) return undefined
  return Math.min(Math.max(Math.floor(limit), 1), ORDER_SEARCH_MAX_LIMIT)
}

export function digitsOnly(value: string): string {
  return String(value || '').replace(/\D/g, '')
}

export function escapeLikePattern(value: string): string {
  return String(value || '').replace(/[#%_]/g, (ch) => `#${ch}`)
}

export function isExplicitOrderNumberQuery(query: string): boolean {
  return /^(#|ORD-|site-ord-|tg-ord-)/i.test(String(query || '').trim())
}

/**
 * Ввод номера заказа: 2112, #2112, ORD-2112.
 * Не телефон (≥7 цифр) и не УНП (9 цифр) — их ищем отдельно.
 */
export function isExactOrderNumberSearch(query: string): boolean {
  const trimmed = String(query || '').trim()
  if (!trimmed) return false
  if (isExplicitOrderNumberQuery(trimmed)) return true
  const lookup = parseOrderLookupId(trimmed)
  if (!lookup) return false
  return digitsOnly(trimmed).length < 7
}

export function orderLookupSortSql(
  lookup: NonNullable<ReturnType<typeof parseOrderLookupId>>,
  alias = 'o',
): { sql: string; params: unknown[] } {
  const prefix = alias ? `${alias}.` : ''
  const placeholders = lookup.candidates.map(() => '?').join(', ')
  return {
    sql: `CASE WHEN (${prefix}id = ? OR ${prefix}number IN (${placeholders})) THEN 0 ELSE 1 END`,
    params: [lookup.numericId, ...lookup.candidates],
  }
}

/** Телефон, УНП, email, явный номер заказа — ищем точечно, без обрезки по «последним 100 именам». */
export function isIdentifierQuery(query: string): boolean {
  const q = String(query || '').trim()
  if (!q) return false
  if (isExplicitOrderNumberQuery(q)) return true
  if (q.includes('@')) return true
  const digits = digitsOnly(q)
  if (digits.length < 7) return false
  return q.replace(/[\d\s+\-()./]/g, '').length === 0
}

export function parseOrderLookupId(query: string): { numericId: number; candidates: string[] } | null {
  const normalized = String(query || '').trim().replace(/^#/, '')
  const match = normalized.match(/^(?:ORD-|site-ord-|tg-ord-)?(\d+)$/i)
  if (!match) return null
  const numericId = Number(match[1])
  if (!Number.isFinite(numericId)) return null
  return {
    numericId,
    candidates: [
      normalized,
      match[1],
      `ORD-${match[1]}`,
      `site-ord-${match[1]}`,
      `tg-ord-${match[1]}`,
    ],
  }
}

export function likeCaseVariants(query: string): string[] {
  const trimmed = String(query || '').trim()
  if (!trimmed) return []
  const variants = new Set<string>([
    trimmed,
    trimmed.toLocaleLowerCase('ru-RU'),
    trimmed.toLocaleUpperCase('ru-RU'),
  ])
  const titled =
    trimmed.charAt(0).toLocaleUpperCase('ru-RU') + trimmed.slice(1).toLocaleLowerCase('ru-RU')
  variants.add(titled)
  return [...variants]
}

function sqlPhoneDigits(columnSql: string): string {
  return `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${columnSql}, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', ''), '/', '')`
}

const TEXT_COLUMNS = [
  'o.number',
  'o.customerName',
  'o.customerPhone',
  'o.customerEmail',
  'c.tax_id',
  'c.company_name',
  'c.legal_name',
  'c.first_name',
  'c.last_name',
  'c.middle_name',
  'c.authorized_person',
  'c.phone',
  'c.email',
] as const

export type OrderSearchClause = {
  sql: string
  params: unknown[]
}

function pushOrderLookup(parts: string[], params: unknown[], lookup: NonNullable<ReturnType<typeof parseOrderLookupId>>): void {
  const placeholders = lookup.candidates.map(() => '?').join(', ')
  parts.push(`(o.id = ? OR o.number IN (${placeholders}))`)
  params.push(lookup.numericId, ...lookup.candidates)
}

function pushTaxIdMatch(parts: string[], params: unknown[], digits: string): void {
  const normalizedTax = `REPLACE(REPLACE(TRIM(COALESCE(c.tax_id, '')), ' ', ''), '-', '')`
  if (digits.length === 9) {
    parts.push(`${normalizedTax} = ?`)
    params.push(digits)
    return
  }
  if (digits.length >= 7 && digits.length <= 12) {
    parts.push(`${normalizedTax} LIKE ? ESCAPE '#'`)
    params.push(`%${escapeLikePattern(digits)}%`)
  }
}

function pushPhoneDigitsMatch(parts: string[], params: unknown[], digits: string): void {
  if (digits.length < 7) return
  const needle = digits.length > 9 ? digits.slice(-9) : digits
  const likeNeedle = `%${escapeLikePattern(needle)}%`
  parts.push(`${sqlPhoneDigits('o.customerPhone')} LIKE ? ESCAPE '#'`)
  parts.push(`${sqlPhoneDigits('c.phone')} LIKE ? ESCAPE '#'`)
  params.push(likeNeedle, likeNeedle)
}

function pushTextLikes(parts: string[], params: unknown[], query: string): void {
  for (const variant of likeCaseVariants(query)) {
    const pattern = `%${escapeLikePattern(variant)}%`
    for (const column of TEXT_COLUMNS) {
      parts.push(`${column} LIKE ? ESCAPE '#'`)
      params.push(pattern)
    }
  }
}

function pushEmailMatch(parts: string[], params: unknown[], query: string): void {
  const pattern = `%${escapeLikePattern(query.trim())}%`
  parts.push(`o.customerEmail LIKE ? ESCAPE '#'`)
  parts.push(`c.email LIKE ? ESCAPE '#'`)
  params.push(pattern, pattern)
}

/**
 * Условие WHERE для текстового поиска заказа.
 * Предполагает `LEFT JOIN customers c ON c.id = o.customer_id`.
 */
export function buildOrderQuerySearchClause(rawQuery: string): OrderSearchClause | null {
  const trimmed = String(rawQuery || '').trim()
  if (!trimmed) return null

  const parts: string[] = []
  const params: unknown[] = []
  const lookup = parseOrderLookupId(trimmed)
  const digits = digitsOnly(trimmed)
  const identifier = isIdentifierQuery(trimmed)

  if (lookup) {
    pushOrderLookup(parts, params, lookup)
    if (isExactOrderNumberSearch(trimmed)) {
      return { sql: `(${parts.join(' OR ')})`, params }
    }
  }

  if (identifier) {
    pushTaxIdMatch(parts, params, digits)
    pushPhoneDigitsMatch(parts, params, digits)
    if (trimmed.includes('@')) {
      pushEmailMatch(parts, params, trimmed)
    }
    if (parts.length === 0) return null
    return { sql: `(${parts.join(' OR ')})`, params }
  }

  pushTextLikes(parts, params, trimmed)
  pushTaxIdMatch(parts, params, digits)
  pushPhoneDigitsMatch(parts, params, digits)
  if (parts.length === 0) return null
  return { sql: `(${parts.join(' OR ')})`, params }
}
