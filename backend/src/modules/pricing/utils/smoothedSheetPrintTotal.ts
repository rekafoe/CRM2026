/**
 * Плавный переход между листовыми ступенями печати.
 *
 * Ступенчатая тиражная скидка иначе даёт обрыв: 30 листов по «дорогому»
 * тарифу могут стоить больше, чем 50 листов по следующему. Итог в узлах
 * делаем неубывающим и линейно интерполируем между соседними порогами.
 */

export type SheetPrintQtyTier = {
  min_qty?: number
  unit_price?: number
  price?: number
  tier_prices?: number[]
}

export type SheetPrintKnot = {
  sheets: number
  pricePerSheet: number
  total: number
}

export function printTierUnitPrice(tier: SheetPrintQtyTier): number {
  if (tier.unit_price != null && Number.isFinite(Number(tier.unit_price))) {
    return Number(tier.unit_price)
  }
  if (tier.price != null && Number.isFinite(Number(tier.price))) {
    return Number(tier.price)
  }
  const fromList = tier.tier_prices?.[0]
  if (fromList != null && Number.isFinite(Number(fromList))) {
    return Number(fromList)
  }
  return 0
}

export function buildMonotonicSheetPrintKnots(
  tiers: SheetPrintQtyTier[] | null | undefined,
  itemsPerSheet: number,
): SheetPrintKnot[] {
  const ips = Math.max(1, Math.floor(Number(itemsPerSheet) || 1))
  const bySheets = new Map<number, SheetPrintKnot>()
  const sorted = [...(tiers ?? [])]
    .filter((tier) => printTierUnitPrice(tier) > 0 && Number(tier.min_qty) > 0)
    .sort((a, b) => Number(a.min_qty) - Number(b.min_qty))

  for (const tier of sorted) {
    const sheets = Math.max(1, Math.round(Number(tier.min_qty) / ips))
    const pricePerSheet = printTierUnitPrice(tier) * ips
    bySheets.set(sheets, {
      sheets,
      pricePerSheet,
      total: sheets * pricePerSheet,
    })
  }

  const knots = Array.from(bySheets.values()).sort((a, b) => a.sheets - b.sheets)
  for (let i = knots.length - 2; i >= 0; i--) {
    if (knots[i].total > knots[i + 1].total) {
      knots[i] = { ...knots[i], total: knots[i + 1].total }
    }
  }
  return knots
}

export function smoothedSheetPrintTotal(
  sheetsNeeded: number,
  tiers: SheetPrintQtyTier[] | null | undefined,
  itemsPerSheet: number,
): number | null {
  const knots = buildMonotonicSheetPrintKnots(tiers, itemsPerSheet)
  if (knots.length === 0) return null

  const sheets = Math.max(1, Math.ceil(Number(sheetsNeeded) || 0))
  const first = knots[0]
  if (sheets <= first.sheets) {
    return Math.min(sheets * first.pricePerSheet, first.total)
  }

  const last = knots[knots.length - 1]
  if (sheets >= last.sheets) {
    return sheets * last.pricePerSheet
  }

  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i]
    const b = knots[i + 1]
    if (sheets > b.sheets) continue
    const span = b.sheets - a.sheets
    if (span <= 0) return a.total
    const t = (sheets - a.sheets) / span
    return a.total + (b.total - a.total) * t
  }

  return last.pricePerSheet * sheets
}
