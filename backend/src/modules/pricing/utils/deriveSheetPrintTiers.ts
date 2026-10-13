import { LayoutCalculationService } from '../services/layoutCalculationService'

export type CentralSheetTier = {
  min_sheets: number
  max_sheets?: number | null
  price_per_sheet: number
}

export type DerivedProductTier = {
  min_qty: number
  max_qty?: number
  unit_price: number
}

/** Цена за изделие хранится с запасом знаков: её снова умножают на шт/лист. */
const UNIT_PRICE_SCALE = 1_000_000

export function sheetTiersHavePositivePrice(tiers: CentralSheetTier[]): boolean {
  return tiers.some((tier) => Number(tier.price_per_sheet) > 0)
}

/**
 * Диапазоны за лист — источник правды.
 * Если их нет или все ставки нулевые, берём плоскую цену технологии
 * (её по-прежнему показывает карточка «Цены печати»).
 */
export function resolveCentralSheetTiers(
  tiers: CentralSheetTier[] | null | undefined,
  flatPricePerSheet: number | null | undefined,
): { tiers: CentralSheetTier[]; usedFlat: boolean } {
  const list = Array.isArray(tiers) ? tiers : []
  if (sheetTiersHavePositivePrice(list)) {
    return { tiers: list, usedFlat: false }
  }
  const flat = Number(flatPricePerSheet)
  if (Number.isFinite(flat) && flat > 0) {
    return {
      tiers: [{ min_sheets: 1, max_sheets: null, price_per_sheet: flat }],
      usedFlat: true,
    }
  }
  return { tiers: [], usedFlat: false }
}

export function itemsPerSheetForDerive(options: {
  itemWidthMm: number
  itemHeightMm: number
  sheetWidthMm: number
  sheetHeightMm: number
  cutMarginMm?: number
  cutGapMm?: number
  itemsPerSheetOverride?: number
}): number {
  const override = Number(options.itemsPerSheetOverride)
  if (Number.isFinite(override) && override > 0) return Math.floor(override)

  const layout = LayoutCalculationService.calculateLayout(
    { width: options.itemWidthMm, height: options.itemHeightMm },
    { width: options.sheetWidthMm, height: options.sheetHeightMm },
    Number.isFinite(Number(options.cutMarginMm)) ? Number(options.cutMarginMm) : undefined,
    Number.isFinite(Number(options.cutGapMm)) ? Number(options.cutGapMm) : undefined,
  )
  return Math.max(1, Math.floor(Number(layout.itemsPerSheet) || 0))
}

export function perItemPriceFromSheet(pricePerSheet: number, itemsPerSheet: number): number {
  const ips = Math.max(1, Math.floor(Number(itemsPerSheet) || 1))
  const raw = Number(pricePerSheet) / ips
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return Math.round(raw * UNIT_PRICE_SCALE) / UNIT_PRICE_SCALE
}

/** min_qty = min_sheets × шт/лист — так же ищет ступень калькулятор заказа. */
export function toProductQtyTiers(
  tiers: CentralSheetTier[],
  itemsPerSheet: number,
): DerivedProductTier[] {
  const ips = Math.max(1, Math.floor(Number(itemsPerSheet) || 1))
  return tiers.map((tier) => {
    const minSheets = Math.max(1, Math.floor(Number(tier.min_sheets) || 1))
    const maxSheets = tier.max_sheets == null || tier.max_sheets === undefined
      ? null
      : Number(tier.max_sheets)
    const minQty = minSheets * ips
    const maxQty = maxSheets != null && Number.isFinite(maxSheets)
      ? (maxSheets + 1) * ips - 1
      : undefined
    return {
      min_qty: minQty,
      max_qty: maxQty,
      unit_price: perItemPriceFromSheet(Number(tier.price_per_sheet) || 0, ips),
    }
  })
}
