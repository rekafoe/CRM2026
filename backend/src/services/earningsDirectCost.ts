export type MaterialUse = { materialId: number; quantity: number }

export type PrintCostRates = {
  technologyCode: string
  counterUnit: string
  m2PricingKind?: string | null
  sheetWidthMm?: number | null
  sheetHeightMm?: number | null
  costPerImpression?: number | null
  costBwPerMeter?: number | null
  costColorPerMeter?: number | null
  costColorPerM2?: number | null
  costWhitePerM2?: number | null
  costVarnishPerM2?: number | null
}

export type PrintUsage =
  | {
      kind: 'sheets'
      technology: string
      impressions: number
      sheetWidthMm?: number
      sheetHeightMm?: number
    }
  | { kind: 'meters'; technology: string; meters: number; color: 'bw' | 'color' }
  | {
      kind: 'm2'
      technology: string
      profile: 'uv_flatbed' | 'roll_wide'
      totalM2: number
      colorPasses: number
      whitePasses: number
      varnishPasses: number
    }
  | { kind: 'none' }

function positive(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

function optionalPrice(value: number | null | undefined): number {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

/** Закупка материалов. Пустая закупочная цена даёт 0, отпускная цена не подставляется. */
export function materialDirectCost(
  uses: MaterialUse[],
  purchasePriceById: Map<number, number | null>,
): number {
  let total = 0
  for (const use of uses) {
    const qty = positive(use.quantity)
    if (qty <= 0) continue
    const price = purchasePriceById.get(use.materialId)
    total += qty * optionalPrice(price)
  }
  return Math.round(total * 10000) / 10000
}

export function sheetImpressions(sheets: number, sides: number): number {
  const sheetCount = positive(sheets)
  if (sheetCount <= 0) return 0
  const sideCount = Number(sides) >= 2 ? 2 : 1
  return sheetCount * sideCount
}

function layerPasses(layer: unknown): number {
  if (layer == null || typeof layer !== 'object') return 0
  const record = layer as { enabled?: unknown; passes?: unknown }
  if (!record.enabled) return 0
  const passes = Math.floor(Number(record.passes) || 0)
  return passes >= 1 ? passes : 0
}

function readRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function materialUsesFromParams(params: unknown, itemQuantity: number): MaterialUse[] {
  const record = readRecord(params)
  const grouped = new Map<number, number>()
  const add = (materialId: number, quantity: number) => {
    if (!Number.isFinite(materialId) || materialId <= 0 || quantity <= 0) return
    grouped.set(materialId, (grouped.get(materialId) || 0) + quantity)
  }
  const materials = Array.isArray(record.materials) ? record.materials : []
  for (const row of materials) {
    const item = readRecord(row)
    add(Number(item.materialId ?? item.material_id), positive(item.quantity))
  }
  if (grouped.size === 0) {
    const components = Array.isArray(record.components) ? record.components : []
    const qty = Math.max(1, Number(itemQuantity) || 1)
    for (const row of components) {
      const item = readRecord(row)
      add(Number(item.materialId ?? item.material_id), positive(item.qtyPerItem) * qty)
    }
  }
  return [...grouped.entries()].map(([materialId, quantity]) => ({ materialId, quantity }))
}

function technologyOf(params: Record<string, unknown>, specs: Record<string, unknown>): string {
  return String(
    params.printTechnology ??
      params.print_technology ??
      specs.printTechnology ??
      specs.print_technology ??
      '',
  ).trim()
}

function pieceM2(params: Record<string, unknown>, specs: Record<string, unknown>): number {
  const custom = readRecord(params.customFormat ?? specs.customFormat)
  const width = positive(custom.width ?? specs.width ?? specs.trimWidthMm)
  const height = positive(custom.height ?? specs.height ?? specs.trimHeightMm)
  if (width <= 0 || height <= 0) return 0
  return (width / 1000) * (height / 1000)
}

export function printUsageFromParams(
  params: unknown,
  itemQuantity: number,
  itemSheets: number,
  itemSides: number,
): PrintUsage {
  const record = readRecord(params)
  const specs = readRecord(record.specifications)
  const layout = readRecord(record.layout ?? specs.layout)
  const technology = technologyOf(record, specs)
  const qty = Math.max(1, Number(itemQuantity) || 1)
  const totalM2 = positive(layout.totalM2Needed ?? layout.totalM2)
  const uv = readRecord(specs.uv_print ?? record.uv_print)
  const uvColor = layerPasses(uv.color)
  const uvWhite = layerPasses(uv.white)
  const uvVarnish = layerPasses(uv.varnish)
  const hasUv = uvColor + uvWhite + uvVarnish > 0

  if (hasUv || (totalM2 > 0 && String(layout.totalM2Needed ?? '') !== '' && !positive(layout.metersNeeded))) {
    const area = totalM2 > 0 ? totalM2 : pieceM2(record, specs) * qty
    if (area > 0 && (hasUv || totalM2 > 0)) {
      return {
        kind: 'm2',
        technology,
        profile: hasUv ? 'uv_flatbed' : 'roll_wide',
        totalM2: area,
        colorPasses: hasUv ? uvColor : 1,
        whitePasses: hasUv ? uvWhite : 0,
        varnishPasses: hasUv ? uvVarnish : 0,
      }
    }
  }

  const meters = positive(layout.metersNeeded)
  if (meters > 0) {
    const colorMode = String(
      record.printColorMode ?? record.print_color_mode ?? specs.printColorMode ?? specs.print_color_mode ?? 'color',
    ).toLowerCase()
    return {
      kind: 'meters',
      technology,
      meters,
      color: colorMode === 'bw' ? 'bw' : 'color',
    }
  }

  const sheets = positive(record.sheetsNeeded ?? specs.sheetsNeeded ?? itemSheets)
  if (sheets > 0) {
    const sides = Number(specs.sides ?? record.sides ?? itemSides)
    const recommended = readRecord(layout.recommendedSheetSize)
    return {
      kind: 'sheets',
      technology,
      impressions: sheetImpressions(sheets, sides),
      sheetWidthMm: positive(recommended.width ?? recommended.sheetWidthMm) || undefined,
      sheetHeightMm: positive(recommended.height ?? recommended.sheetHeightMm) || undefined,
    }
  }

  return { kind: 'none' }
}

export function printDirectCost(usage: PrintUsage, rates: PrintCostRates[]): number {
  if (usage.kind === 'none') return 0
  const tech = usage.technology.trim().toLowerCase()
  const sameTech = (row: PrintCostRates) =>
    !tech || row.technologyCode.trim().toLowerCase() === tech

  if (usage.kind === 'sheets') {
    const rows = rates.filter((row) => sameTech(row) && row.counterUnit === 'sheets' && optionalPrice(row.costPerImpression) > 0)
    const picked = pickSheetRow(rows, usage.sheetWidthMm, usage.sheetHeightMm)
    if (!picked) return 0
    return Math.round(usage.impressions * optionalPrice(picked.costPerImpression) * 10000) / 10000
  }

  if (usage.kind === 'meters') {
    const row = rates.find((item) => sameTech(item) && item.counterUnit === 'meters')
    if (!row) return 0
    const rate = usage.color === 'bw' ? row.costBwPerMeter : row.costColorPerMeter
    return Math.round(usage.meters * optionalPrice(rate) * 10000) / 10000
  }

  const row = rates.find((item) => {
    if (!sameTech(item) || item.counterUnit !== 'm2') return false
    if (usage.profile === 'uv_flatbed') return item.m2PricingKind === 'uv_flatbed' || item.m2PricingKind == null
    return item.m2PricingKind === 'roll_wide' || item.m2PricingKind == null
  })
  if (!row) return 0
  const color = usage.colorPasses * optionalPrice(row.costColorPerM2)
  const white = usage.profile === 'uv_flatbed' ? usage.whitePasses * optionalPrice(row.costWhitePerM2) : 0
  const varnish = usage.profile === 'uv_flatbed' ? usage.varnishPasses * optionalPrice(row.costVarnishPerM2) : 0
  return Math.round(usage.totalM2 * (color + white + varnish) * 10000) / 10000
}

function pickSheetRow(
  rows: PrintCostRates[],
  width?: number,
  height?: number,
): PrintCostRates | undefined {
  if (rows.length === 0) return undefined
  if (width && height) {
    const target = width * height
    return [...rows].sort((a, b) => {
      const aArea = positive(a.sheetWidthMm) * positive(a.sheetHeightMm)
      const bArea = positive(b.sheetWidthMm) * positive(b.sheetHeightMm)
      return Math.abs(aArea - target) - Math.abs(bArea - target)
    })[0]
  }
  return rows[0]
}
