import type { Database } from 'sqlite'

export interface PrintingTechnologyUsageCounts {
  printers: number
  products: number
  print_prices: number
  material_types: number
  total: number
}

const TECHNOLOGY_VALUE_KEYS = new Set([
  'technology_code',
  'technologyCode',
  'technology',
  'print_technology',
  'printTechnology',
  'cover_print_technology',
  'coverPrintTechnology',
])

const TECHNOLOGY_LIST_KEYS = new Set([
  'allowedTechnologies',
  'allowed_print_technologies',
])

function normalizeCode(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function collectPrintingTechnologyCodes(
  value: unknown,
  result = new Set<string>(),
): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectPrintingTechnologyCodes(item, result))
    return result
  }
  if (!value || typeof value !== 'object') return result

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (TECHNOLOGY_VALUE_KEYS.has(key) && typeof nested === 'string') {
      const code = normalizeCode(nested)
      if (code) result.add(code)
    } else if (TECHNOLOGY_LIST_KEYS.has(key) && Array.isArray(nested)) {
      nested.forEach((item) => {
        const code = normalizeCode(item)
        if (code) result.add(code)
      })
    }
    collectPrintingTechnologyCodes(nested, result)
  }
  return result
}

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

async function tableExists(db: Database, tableName: string): Promise<boolean> {
  const row = await db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName],
  )
  return Boolean(row)
}

async function countByCode(
  db: Database,
  tableName: string,
  columnName: string,
  technologyCode: string,
  options?: { distinctColumn?: string },
): Promise<number> {
  if (!(await tableExists(db, tableName))) return 0
  const countExpression = options?.distinctColumn
    ? `COUNT(DISTINCT ${options.distinctColumn})`
    : 'COUNT(*)'
  const row = await db.get<{ count: number }>(
    `SELECT ${countExpression} as count
     FROM ${tableName}
     WHERE LOWER(${columnName}) = LOWER(?)`,
    [technologyCode],
  )
  return Number(row?.count ?? 0)
}

export async function buildPrintingTechnologyProductUsage(
  db: Database,
): Promise<Map<string, Set<number>>> {
  const usage = new Map<string, Set<number>>()
  const add = (productId: unknown, raw: unknown) => {
    const id = Number(productId)
    if (!Number.isInteger(id) || id <= 0) return
    const parsed = parseJsonObject(raw)
    if (!parsed) return
    for (const code of collectPrintingTechnologyCodes(parsed)) {
      const products = usage.get(code) ?? new Set<number>()
      products.add(id)
      usage.set(code, products)
    }
  }

  if (await tableExists(db, 'product_template_configs')) {
    const configs = await db.all<Array<{
      product_id: number
      config_data: string | null
    }>>(
      `SELECT product_id, config_data
       FROM product_template_configs
       WHERE is_active = 1`,
    )
    configs.forEach((row) => add(row.product_id, row.config_data))
  }

  if (await tableExists(db, 'products')) {
    try {
      const products = await db.all<Array<{ id: number; print_settings: string | null }>>(
        'SELECT id, print_settings FROM products WHERE print_settings IS NOT NULL',
      )
      products.forEach((row) => add(row.id, row.print_settings))
    } catch {
      // Старые схемы без print_settings.
    }
  }

  return usage
}

export async function getPrintingTechnologyUsageCounts(
  db: Database,
  technologyCode: string,
  productUsage?: Map<string, Set<number>>,
): Promise<PrintingTechnologyUsageCounts> {
  const normalizedCode = normalizeCode(technologyCode)
  const productsByCode = productUsage ?? await buildPrintingTechnologyProductUsage(db)
  const [printers, printPrices, materialTypes] = await Promise.all([
    countByCode(db, 'printers', 'technology_code', normalizedCode),
    countByCode(db, 'print_prices', 'technology_code', normalizedCode),
    countByCode(
      db,
      'material_type_print_technologies',
      'technology_code',
      normalizedCode,
      { distinctColumn: 'material_type_id' },
    ),
  ])
  const products = productsByCode.get(normalizedCode)?.size ?? 0
  return {
    printers,
    products,
    print_prices: printPrices,
    material_types: materialTypes,
    total: printers + products + printPrices + materialTypes,
  }
}

export async function getPrintingTechnologyUsageMap(
  db: Database,
  technologyCodes: string[],
): Promise<Map<string, PrintingTechnologyUsageCounts>> {
  const productUsage = await buildPrintingTechnologyProductUsage(db)
  const entries = await Promise.all(
    technologyCodes.map(async (technologyCode) => [
      normalizeCode(technologyCode),
      await getPrintingTechnologyUsageCounts(db, technologyCode, productUsage),
    ] as const),
  )
  return new Map(entries)
}
