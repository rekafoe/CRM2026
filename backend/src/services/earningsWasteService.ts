import type { Database } from 'sqlite'
import { hasColumn } from '../utils/tableSchemaCache'
import { notWaitingStatusSql } from '../utils/orderFulfillmentScope'
import { materialUsesFromParams, wasteItemMoney, type PrintCostRates } from './earningsDirectCost'
import { splitEqualMoney } from './earningsWasteShare'

type SettingsDb = Pick<Database, 'all' | 'get'>

export type MonthWastePool = {
  total: number
  operatorCount: number
  shares: Map<number, number>
}

const emptyPool = (): MonthWastePool => ({ total: 0, operatorCount: 0, shares: new Map() })

function numberOrNull(value: unknown): number | null {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

async function loadPrintRates(db: SettingsDb): Promise<PrintCostRates[]> {
  try {
    if (!(await hasColumn('print_prices', 'cost_per_impression'))) return []
    const found = await db.all<Array<Record<string, unknown>>>(
      `SELECT technology_code, counter_unit, m2_pricing_kind, sheet_width_mm, sheet_height_mm,
              cost_per_impression, cost_bw_per_meter, cost_color_per_meter,
              cost_color_per_m2, cost_white_per_m2, cost_varnish_per_m2
         FROM print_prices
        WHERE COALESCE(is_active, 1) = 1`,
    )
    return found.map((row) => ({
      technologyCode: String(row.technology_code ?? ''),
      counterUnit: String(row.counter_unit ?? ''),
      m2PricingKind: row.m2_pricing_kind != null ? String(row.m2_pricing_kind) : null,
      sheetWidthMm: Number(row.sheet_width_mm) || null,
      sheetHeightMm: Number(row.sheet_height_mm) || null,
      costPerImpression: numberOrNull(row.cost_per_impression),
      costBwPerMeter: numberOrNull(row.cost_bw_per_meter),
      costColorPerMeter: numberOrNull(row.cost_color_per_meter),
      costColorPerM2: numberOrNull(row.cost_color_per_m2),
      costWhitePerM2: numberOrNull(row.cost_white_per_m2),
      costVarnishPerM2: numberOrNull(row.cost_varnish_per_m2),
    }))
  } catch {
    return []
  }
}

async function loadPurchasePrices(db: SettingsDb, materialIds: number[]): Promise<Map<number, number | null>> {
  const prices = new Map<number, number | null>()
  if (materialIds.length === 0) return prices
  try {
    if (!(await hasColumn('materials', 'purchase_price'))) return prices
  } catch {
    return prices
  }
  const placeholders = materialIds.map(() => '?').join(',')
  const found = await db.all<Array<{ id: number; purchase_price: number | null }>>(
    `SELECT id, purchase_price FROM materials WHERE id IN (${placeholders})`,
    materialIds,
  )
  for (const row of found) {
    const value = Number(row.purchase_price)
    prices.set(Number(row.id), Number.isFinite(value) ? value : null)
  }
  return prices
}

/**
 * Сумма брака месяца и равные доли исполнителей.
 * В пул входят только те, у кого за месяц есть начисление типа operator.
 */
export async function getWasteSharesForMonths(
  db: SettingsDb,
  months: string[],
): Promise<Map<string, MonthWastePool>> {
  const keys = [...new Set(months.map((month) => String(month).slice(0, 7)).filter((month) => /^\d{4}-\d{2}$/.test(month)))]
  const result = new Map<string, MonthWastePool>()
  for (const month of keys) result.set(month, emptyPool())
  if (keys.length === 0) return result

  try {
    if (!(await hasColumn('items', 'waste'))) return result
  } catch {
    return result
  }

  let hasSheets = false
  let hasSides = false
  let hasEarningType = false
  let hasIsInternal = false
  let hasPaymentChannel = false
  let hasIsCancelled = false
  try {
    hasSheets = await hasColumn('items', 'sheets')
    hasSides = await hasColumn('items', 'sides')
    hasEarningType = await hasColumn('order_item_earnings', 'earning_type')
    hasIsInternal = await hasColumn('orders', 'is_internal')
    hasPaymentChannel = await hasColumn('orders', 'payment_channel')
    hasIsCancelled = await hasColumn('orders', 'is_cancelled')
  } catch {
    /* колонки читаем по отдельности ниже, отсутствие не рвёт расчёт */
  }

  const excludeInternal = hasIsInternal
    ? 'AND COALESCE(o.is_internal, 0) = 0'
    : hasPaymentChannel
      ? "AND COALESCE(o.payment_channel, 'cash') != 'internal'"
      : ''
  const excludeCancelled = hasIsCancelled ? 'AND COALESCE(o.is_cancelled, 0) = 0' : ''
  const placeholders = keys.map(() => '?').join(',')
  const sheetSel = hasSheets ? 'i.sheets' : '0'
  const sideSel = hasSides ? 'i.sides' : '1'

  const wasteRows = await db.all<Array<{
    monthKey: string
    waste: number
    sheets: number
    sides: number
    quantity: number
    params: string
  }>>(
    `SELECT substr(date(COALESCE(o.createdAt, o.created_at)), 1, 7) AS monthKey,
            i.waste AS waste,
            ${sheetSel} AS sheets,
            ${sideSel} AS sides,
            i.quantity AS quantity,
            i.params AS params
       FROM items i
       JOIN orders o ON o.id = i.orderId
      WHERE COALESCE(i.waste, 0) > 0
        AND substr(date(COALESCE(o.createdAt, o.created_at)), 1, 7) IN (${placeholders})
        ${excludeCancelled}
        ${excludeInternal}
        AND ${notWaitingStatusSql('o.status')}`,
    keys,
  ).catch(() => [])

  const parsed = (wasteRows || []).map((row) => {
    let params: unknown = {}
    try {
      params = JSON.parse(row.params || '{}')
    } catch {
      params = {}
    }
    return { ...row, params }
  })

  const materialIds = new Set<number>()
  for (const row of parsed) {
    for (const use of materialUsesFromParams(row.params, Number(row.quantity) || 0)) {
      materialIds.add(use.materialId)
    }
  }
  const [purchasePrices, printRates] = await Promise.all([
    loadPurchasePrices(db, [...materialIds]),
    loadPrintRates(db),
  ])

  const totals = new Map<string, number>()
  for (const row of parsed) {
    const cost = wasteItemMoney({
      wasteSheets: Number(row.waste) || 0,
      sides: Number(row.sides) || 1,
      params: row.params,
      itemQuantity: Number(row.quantity) || 0,
      itemSheets: Number(row.sheets) || 0,
      purchasePriceById: purchasePrices,
      printRates,
    })
    if (cost <= 0) continue
    const month = String(row.monthKey)
    totals.set(month, (totals.get(month) || 0) + cost)
  }

  const earningTypeSql = hasEarningType ? "AND e.earning_type = 'operator'" : ''
  const operators = await db.all<Array<{ monthKey: string; userId: number }>>(
    `SELECT substr(e.earned_date, 1, 7) AS monthKey, e.user_id AS userId
       FROM order_item_earnings e
      WHERE substr(e.earned_date, 1, 7) IN (${placeholders})
        AND COALESCE(e.amount, 0) > 0
        ${earningTypeSql}
      GROUP BY monthKey, e.user_id`,
    keys,
  ).catch(() => [])

  const operatorsByMonth = new Map<string, number[]>()
  for (const row of operators || []) {
    const month = String(row.monthKey)
    const list = operatorsByMonth.get(month) || []
    list.push(Number(row.userId))
    operatorsByMonth.set(month, list)
  }

  for (const month of keys) {
    const raw = totals.get(month) || 0
    const total = Math.round(raw * 100) / 100
    const operatorIds = [...new Set((operatorsByMonth.get(month) || []).map((id) => Number(id)).filter((id) => id > 0))]
    const shares = splitEqualMoney(total, operatorIds)
    result.set(month, {
      total,
      operatorCount: operatorIds.length,
      shares: new Map(shares.map((share) => [share.userId, share.amount])),
    })
  }
  return result
}
