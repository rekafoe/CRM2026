import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'
import { getCustomCalculatorOperatorPercent } from './customCalculatorPercentSettings'
import { getDesignTemplatesByIds } from './designTemplateService'
import {
  materialDirectCost,
  materialUsesFromParams,
  printDirectCost,
  printUsageFromParams,
  type MaterialUse,
  type PrintCostRates,
} from './earningsDirectCost'
import { earningsBase, splitPositionPercents } from './earningsRoleSplit'
import { getRoleOrderPercents } from './earningsRoleRateSettings'
import { resolveEarningsOperatorPercent } from './earningsOperatorPercent'

export type OrderCostExpense = {
  kind: 'material' | 'print' | 'design'
  title: string
  quantity: number | null
  amount: number
}

export type OrderCostLine = {
  itemId: number
  title: string
  quantity: number
  revenue: number
  expense: number
  base: number
  contactPercent: number
  responsiblePercent: number
  executorPercent: number
  contactAmount: number
  responsibleAmount: number
  executorAmount: number
  contactAssigned: boolean
  responsibleAssigned: boolean
  executorAssigned: boolean
}

export type OrderCostSheet = {
  orderId: number
  rates: { contact: number; responsible: number }
  expenses: OrderCostExpense[]
  expensesTotal: number
  lines: OrderCostLine[]
  totals: {
    revenue: number
    expense: number
    base: number
    contact: number
    responsible: number
    executor: number
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000
}

function readParams(raw: string | null): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function itemTitle(type: string | null, params: Record<string, unknown>): string {
  const productName = String(params.productName ?? params.name ?? '').trim()
  if (productName) return productName
  const description = String(params.description ?? '').trim()
  if (
    description
    && description !== 'Описание товара'
    && description !== 'Товар из калькулятора'
  ) {
    return description
  }
  const label = String(type ?? '').trim()
  if (label && label !== 'print') return label
  return 'Позиция'
}

function designFee(
  params: Record<string, unknown>,
  quantity: number,
  templates: Map<number, { usage_fee?: number | null }>,
): number {
  const designTemplateId = Number(params.designTemplateId)
  if (!Number.isFinite(designTemplateId) || designTemplateId <= 0) return 0
  const feeFromParams = Number(params.designUsageFee ?? params.usage_fee)
  if (Number.isFinite(feeFromParams) && feeFromParams >= 0) return feeFromParams
  const usageFee = Number(templates.get(designTemplateId)?.usage_fee) || 0
  if (usageFee > 0 && quantity > 0) return usageFee
  return 0
}

function shareAmount(base: number, percent: number, assigned: boolean): number {
  if (!assigned || base <= 0 || percent <= 0) return 0
  return roundMoney((base * percent) / 100)
}

export async function buildOrderCostSheet(orderId: number): Promise<OrderCostSheet | null> {
  const db = await getDb()

  let hasExecutor = false
  let hasResponsible = false
  let hasContact = false
  try {
    hasExecutor = await hasColumn('items', 'executor_user_id')
    hasResponsible = await hasColumn('orders', 'responsible_user_id')
    hasContact = await hasColumn('orders', 'contact_user_id')
  } catch { /* ignore */ }

  const header = await db.get<{ userId: number | null; contactUserId: number | null; responsibleUserId: number | null }>(
    `SELECT o.userId as userId,
            ${hasContact ? 'o.contact_user_id' : 'NULL'} as contactUserId,
            ${hasResponsible ? 'o.responsible_user_id' : 'NULL'} as responsibleUserId
       FROM orders o WHERE o.id = ?`,
    [orderId],
  )
  if (!header) return null
  const contactUserId = header.contactUserId != null ? Number(header.contactUserId) : null
  const responsibleUserId = header?.responsibleUserId != null
    ? Number(header.responsibleUserId)
    : (header?.userId != null ? Number(header.userId) : null)

  const itemRows = await db.all<Array<{
    itemId: number
    price: number
    quantity: number
    params: string
    itemType: string | null
    itemSheets: number | null
    itemSides: number | null
    executorUserId: number | null
  }>>(
    `SELECT i.id as itemId, i.price as price, i.quantity as quantity, i.params as params,
            i.type as itemType, i.sheets as itemSheets, i.sides as itemSides,
            ${hasExecutor ? 'i.executor_user_id' : 'NULL'} as executorUserId
       FROM items i
      WHERE i.orderId = ?
      ORDER BY i.id`,
    [orderId],
  )

  const productIds = new Set<number>()
  const operationIds = new Set<number>()
  const designTemplateIds = new Set<number>()
  const parsed = itemRows.map((row) => {
    const params = readParams(row.params)
    const designTemplateId = Number(params.designTemplateId)
    if (Number.isFinite(designTemplateId) && designTemplateId > 0) designTemplateIds.add(designTemplateId)
    const productId = Number(params.productId)
    if (Number.isFinite(productId)) productIds.add(productId)
    else if (row.itemType != null && String(row.itemType).trim() !== '') {
      const fromType = Number(String(row.itemType).trim())
      if (Number.isFinite(fromType) && fromType > 0) productIds.add(fromType)
    }
    const services = Array.isArray(params.services) ? params.services : []
    for (const service of services) {
      const opId = Number((service as { operationId?: unknown })?.operationId)
      if (Number.isFinite(opId)) operationIds.add(opId)
    }
    const postprint = Array.isArray(params.postprintOperations) ? params.postprintOperations : []
    for (const op of postprint) {
      const sid = Number((op as { serviceId?: unknown; id?: unknown })?.serviceId ?? (op as { id?: unknown })?.id)
      if (Number.isFinite(sid)) operationIds.add(sid)
    }
    const opId = Number(params.operationId)
    if (Number.isFinite(opId)) operationIds.add(opId)
    return { row, params }
  })

  const productPercentMap = new Map<number, number>()
  if (productIds.size > 0 && await hasColumn('products', 'operator_percent').catch(() => false)) {
    const ids = [...productIds]
    const rows = await db.all<Array<{ id: number; operator_percent: number | null }>>(
      `SELECT id, operator_percent FROM products WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    )
    for (const row of rows) {
      const value = Number(row.operator_percent)
      productPercentMap.set(Number(row.id), Number.isFinite(value) ? value : 0)
    }
  }

  const operationPercentMap = new Map<number, number>()
  if (operationIds.size > 0 && await hasColumn('post_processing_services', 'operator_percent').catch(() => false)) {
    const ids = [...operationIds]
    const rows = await db.all<Array<{ id: number; operator_percent: number | null }>>(
      `SELECT id, operator_percent FROM post_processing_services WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    )
    for (const row of rows) {
      const value = Number(row.operator_percent)
      operationPercentMap.set(Number(row.id), Number.isFinite(value) ? value : 0)
    }
  }

  const templates = await getDesignTemplatesByIds([...designTemplateIds])
  const rolePercents = await getRoleOrderPercents(db)
  const customCalculatorPercent = await getCustomCalculatorOperatorPercent(db)

  const materialQty = new Map<number, number>()
  let printTotal = 0
  let designTotal = 0
  const lines: OrderCostLine[] = []

  const purchasePrices = new Map<number, number | null>()
  const allUses: MaterialUse[] = []
  for (const entry of parsed) {
    const qty = Number(entry.row.quantity) || 0
    allUses.push(...materialUsesFromParams(entry.params, qty))
  }
  const materialIds = [...new Set(allUses.map((use) => use.materialId))]
  const materialNames = new Map<number, string>()
  if (materialIds.length > 0) {
    const hasPurchase = await hasColumn('materials', 'purchase_price').catch(() => false)
    const rows = await db.all<Array<{ id: number; name: string; purchase_price?: number | null }>>(
      `SELECT id, name${hasPurchase ? ', purchase_price' : ''} FROM materials WHERE id IN (${materialIds.map(() => '?').join(',')})`,
      materialIds,
    )
    for (const row of rows) {
      materialNames.set(Number(row.id), String(row.name || `Материал ${row.id}`))
      if (hasPurchase) {
        const value = Number(row.purchase_price)
        purchasePrices.set(Number(row.id), Number.isFinite(value) ? value : null)
      }
    }
  }

  const printCosts = await loadPrintRates(db)

  for (const entry of parsed) {
    const qty = Number(entry.row.quantity) || 0
    const revenue = roundMoney((Number(entry.row.price) || 0) * qty)
    const uses = materialUsesFromParams(entry.params, qty)
    for (const use of uses) {
      materialQty.set(use.materialId, (materialQty.get(use.materialId) || 0) + use.quantity)
    }
    const materialCost = materialDirectCost(uses, purchasePrices)
    const printCost = printDirectCost(
      printUsageFromParams(entry.params, qty, Number(entry.row.itemSheets) || 0, Number(entry.row.itemSides) || 1),
      printCosts,
    )
    printTotal += printCost
    const fee = designFee(entry.params, qty, templates)
    designTotal += fee
    const base = earningsBase(revenue, fee, materialCost + printCost)
    const positionPercent = resolveEarningsOperatorPercent({
      params: entry.params,
      itemType: entry.row.itemType,
      productPercentMap,
      operationPercentMap,
      customCalculatorPercent,
    })
    const rates = splitPositionPercents({
      positionPercent,
      contactPercent: rolePercents.contact,
      responsiblePercent: rolePercents.responsible,
    })
    const contactAssigned = contactUserId != null && contactUserId > 0
    const responsibleAssigned = responsibleUserId != null && responsibleUserId > 0
    const executorId = entry.row.executorUserId != null ? Number(entry.row.executorUserId) : null
    const executorAssigned = executorId != null && executorId > 0
    lines.push({
      itemId: entry.row.itemId,
      title: itemTitle(entry.row.itemType, entry.params),
      quantity: qty,
      revenue,
      expense: roundMoney(materialCost + printCost + fee),
      base,
      contactPercent: rates.contact,
      responsiblePercent: rates.responsible,
      executorPercent: rates.executor,
      contactAmount: shareAmount(base, rates.contact, contactAssigned),
      responsibleAmount: shareAmount(base, rates.responsible, responsibleAssigned),
      executorAmount: shareAmount(base, rates.executor, executorAssigned),
      contactAssigned,
      responsibleAssigned,
      executorAssigned,
    })
  }

  const expenses: OrderCostExpense[] = []
  const materialIdsSorted = [...materialQty.keys()].sort((a, b) =>
    (materialNames.get(a) || '').localeCompare(materialNames.get(b) || '', 'ru'),
  )
  for (const materialId of materialIdsSorted) {
    const quantity = materialQty.get(materialId) || 0
    const amount = materialDirectCost([{ materialId, quantity }], purchasePrices)
    expenses.push({
      kind: 'material',
      title: materialNames.get(materialId) || `Материал ${materialId}`,
      quantity,
      amount,
    })
  }
  if (printTotal > 0) {
    expenses.push({ kind: 'print', title: 'Печать', quantity: null, amount: roundMoney(printTotal) })
  }
  if (designTotal > 0) {
    expenses.push({ kind: 'design', title: 'Плата за макет', quantity: null, amount: roundMoney(designTotal) })
  }

  const totals = lines.reduce(
    (acc, line) => {
      acc.revenue += line.revenue
      acc.expense += line.expense
      acc.base += line.base
      acc.contact += line.contactAmount
      acc.responsible += line.responsibleAmount
      acc.executor += line.executorAmount
      return acc
    },
    { revenue: 0, expense: 0, base: 0, contact: 0, responsible: 0, executor: 0 },
  )

  return {
    orderId,
    rates: { contact: rolePercents.contact, responsible: rolePercents.responsible },
    expenses,
    expensesTotal: roundMoney(expenses.reduce((sum, row) => sum + row.amount, 0)),
    lines,
    totals: {
      revenue: roundMoney(totals.revenue),
      expense: roundMoney(totals.expense),
      base: roundMoney(totals.base),
      contact: roundMoney(totals.contact),
      responsible: roundMoney(totals.responsible),
      executor: roundMoney(totals.executor),
    },
  }
}

async function loadPrintRates(db: Awaited<ReturnType<typeof getDb>>): Promise<PrintCostRates[]> {
  try {
    const hasCost = await hasColumn('print_prices', 'cost_per_impression')
    if (!hasCost) return []
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

function numberOrNull(value: unknown): number | null {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}
