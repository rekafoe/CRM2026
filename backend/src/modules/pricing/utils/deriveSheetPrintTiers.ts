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

function normalizedMinSheets(value: unknown): number | null {
  const min = Math.floor(Number(value))
  if (!Number.isFinite(min) || min <= 0) return null
  return min
}

function positiveSheetPrice(value: unknown): number {
  const price = Number(value)
  return Number.isFinite(price) && price > 0 ? price : 0
}

type MergedSheetTier = {
  min_sheets: number
  max_sheets: number | null
  price_per_sheet: number
}

function normalizedMaxSheets(value: unknown): number | null {
  if (value == null || value === '') return null
  const max = Math.floor(Number(value))
  return Number.isFinite(max) ? max : null
}

/**
 * Склеивает списки диапазонов одной цветности.
 * Списки идут от новой записи к старой.
 * Структура порогов — только с самой новой непустой книги: чужие min_sheets
 * из более старых записей не подмешиваем (иначе findTierForQuantity уходит
 * на дешёвый «хвост» старой книги и занижает тираж).
 * На уже взятых порогах положительная ставка новой записи важнее, ноль не
 * затирает цену того же порога из более старой записи.
 * fillZeroSlots — подставить плоскую цену в нулевые пороги, не трогая ненулевые.
 * Без флага ноль остаётся нулём, пока в списке есть хотя бы одна живая ставка
 * (так двусторонняя и ч/б не меняются).
 */
export function mergeCentralSheetTierLists(
  tierListsNewestFirst: Array<CentralSheetTier[] | null | undefined>,
  flatPricePerSheet?: number | null,
  options?: { fillZeroSlots?: boolean },
): { tiers: CentralSheetTier[]; usedFlat: boolean } {
  const byMin = new Map<number, MergedSheetTier>()
  let structureLocked = false
  for (const list of tierListsNewestFirst) {
    if (!Array.isArray(list)) continue
    let listAddedSlot = false
    for (const tier of list) {
      const min = normalizedMinSheets(tier?.min_sheets)
      if (min == null) continue
      const price = positiveSheetPrice(tier?.price_per_sheet)
      const prev = byMin.get(min)
      if (!prev) {
        // Пороги задаёт первая непустая (самая новая) книга; дальше только fill.
        if (structureLocked) continue
        byMin.set(min, {
          min_sheets: min,
          max_sheets: normalizedMaxSheets(tier?.max_sheets),
          price_per_sheet: price,
        })
        listAddedSlot = true
        continue
      }
      if (prev.price_per_sheet <= 0 && price > 0) {
        byMin.set(min, {
          min_sheets: min,
          max_sheets: prev.max_sheets ?? normalizedMaxSheets(tier?.max_sheets),
          price_per_sheet: price,
        })
      }
    }
    if (listAddedSlot || byMin.size > 0) structureLocked = true
  }

  const flat = positiveSheetPrice(flatPricePerSheet)
  if (byMin.size === 0) {
    if (flat <= 0) return { tiers: [], usedFlat: false }
    return {
      tiers: [{ min_sheets: 1, max_sheets: null, price_per_sheet: flat }],
      usedFlat: true,
    }
  }

  const slots = [...byMin.values()].sort((a, b) => a.min_sheets - b.min_sheets)
  const anyPositive = slots.some((slot) => slot.price_per_sheet > 0)
  if (!anyPositive) {
    if (flat <= 0) return { tiers: slots, usedFlat: false }
    return {
      tiers: [{ min_sheets: 1, max_sheets: null, price_per_sheet: flat }],
      usedFlat: true,
    }
  }

  if (!options?.fillZeroSlots || flat <= 0) {
    return { tiers: slots, usedFlat: false }
  }

  let usedFlat = false
  return {
    tiers: slots.map((slot) => {
      if (slot.price_per_sheet > 0) return slot
      usedFlat = true
      return { ...slot, price_per_sheet: flat }
    }),
    usedFlat,
  }
}

/**
 * Диапазоны за лист — источник правды.
 * Если их нет или все ставки нулевые, берём плоскую цену технологии
 * (её по-прежнему показывает карточка «Цены печати»).
 * Ненулевая ставка того же порога важнее нуля. Отдельные нулевые пороги
 * плоской ценой здесь не закрываются — это делает заполнение одностороннего цвета.
 */
export function resolveCentralSheetTiers(
  tiers: CentralSheetTier[] | null | undefined,
  flatPricePerSheet: number | null | undefined,
): { tiers: CentralSheetTier[]; usedFlat: boolean } {
  return mergeCentralSheetTierLists([tiers], flatPricePerSheet)
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
  const byMin = new Map<number, DerivedProductTier>()
  for (const tier of tiers) {
    const minSheets = Math.max(1, Math.floor(Number(tier.min_sheets) || 1))
    const maxSheets = tier.max_sheets == null || tier.max_sheets === undefined
      ? null
      : Number(tier.max_sheets)
    const minQty = minSheets * ips
    const maxQty = maxSheets != null && Number.isFinite(maxSheets)
      ? (maxSheets + 1) * ips - 1
      : undefined
    const next: DerivedProductTier = {
      min_qty: minQty,
      max_qty: maxQty,
      unit_price: perItemPriceFromSheet(Number(tier.price_per_sheet) || 0, ips),
    }
    const prev = byMin.get(minQty)
    if (!prev || (prev.unit_price <= 0 && next.unit_price > 0)) byMin.set(minQty, next)
  }
  return [...byMin.values()].sort((a, b) => a.min_qty - b.min_qty)
}
