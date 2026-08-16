import { getDb } from '../../../db'
import { pieceAreaM2, validateTrimFitsBed } from './uvFlatbedPricingService'

export interface RollWideM2TierRow {
  min_m2: number
  max_m2: number | null
  price_per_m2: number
}

export interface RollWideM2Rates {
  printPriceId: number
  technologyCode: string
  price_color_per_m2: number | null
  min_charge: number
  max_width_mm: number
  max_height_mm: number
  supports_bw: boolean
  m2PricingKind: 'roll_wide' | 'uv_flatbed' | null
  tiers: RollWideM2TierRow[]
}

export interface RollWideM2PricingResult {
  printPrice: number
  pieceAreaM2: number
  totalM2: number
  minChargeApplied: boolean
  ratePerM2: number
  quantity: number
  tier?: RollWideM2TierRow | null
}

function normalizeTechnologyCode(technologyCode: string): string {
  return String(technologyCode || '').trim().toLowerCase()
}

function normalizeColorMode(raw: string | undefined): 'color' | 'bw' {
  return String(raw || '').trim().toLowerCase() === 'bw' ? 'bw' : 'color'
}

export function lookupRollWideM2Tier(
  tiers: RollWideM2TierRow[],
  totalM2: number,
): RollWideM2TierRow | null {
  const sorted = [...tiers].sort((a, b) => b.min_m2 - a.min_m2)
  for (const tier of sorted) {
    if (totalM2 >= tier.min_m2 && (tier.max_m2 == null || totalM2 <= tier.max_m2)) {
      return tier
    }
  }
  return sorted[sorted.length - 1] ?? null
}

export function calculateRollWideM2Price(params: {
  trimWidthMm: number
  trimHeightMm: number
  quantity: number
  rates: RollWideM2Rates
  /** Суммарные м² группы корзины/заказа — только для выбора ступени; биллинг остаётся по totalM2 позиции. */
  tierM2Override?: number | null
}): RollWideM2PricingResult {
  const area = pieceAreaM2(params.trimWidthMm, params.trimHeightMm)
  const quantity = Math.max(1, Math.floor(Number(params.quantity) || 0))
  const totalM2 = area * quantity
  const overrideRaw = Number(params.tierM2Override)
  const tierLookupM2 =
    Number.isFinite(overrideRaw) && overrideRaw > 0 ? overrideRaw : totalM2
  const matchedTier = lookupRollWideM2Tier(params.rates.tiers, tierLookupM2)
  const baseRate = Number(params.rates.price_color_per_m2 ?? 0)
  const ratePerM2 = Number(matchedTier?.price_per_m2 ?? 0) > 0 ? Number(matchedTier?.price_per_m2 ?? 0) : baseRate
  const subtotal = Math.round(ratePerM2 * totalM2 * 100) / 100
  const minCharge = Math.max(0, Number(params.rates.min_charge) || 0)
  const minChargeApplied = minCharge > 0 && subtotal < minCharge
  const printPrice = minChargeApplied ? minCharge : subtotal

  return {
    printPrice: Math.round(printPrice * 100) / 100,
    pieceAreaM2: area,
    totalM2,
    minChargeApplied,
    ratePerM2,
    quantity,
    tier: matchedTier,
  }
}

export function deriveQtyTiersFromTotalM2(
  tiers: RollWideM2TierRow[],
  pieceAreaM2Value: number,
): Array<{ min_qty: number; max_qty?: number; unit_price: number; source_min_m2: number; source_max_m2?: number | null }> {
  if (!Number.isFinite(pieceAreaM2Value) || pieceAreaM2Value <= 0) return []
  const sorted = [...tiers].sort((a, b) => a.min_m2 - b.min_m2)
  const mapped: Array<{
    min_qty: number
    max_qty?: number
    unit_price: number
    source_min_m2: number
    source_max_m2?: number | null
  }> = []

  for (const tier of sorted) {
    const minQty = Math.max(1, Math.ceil(Number(tier.min_m2 || 0) / pieceAreaM2Value))
    const maxQtyRaw =
      tier.max_m2 != null && Number.isFinite(Number(tier.max_m2))
        ? Math.floor(Number(tier.max_m2) / pieceAreaM2Value)
        : undefined
    const maxQty = maxQtyRaw != null && maxQtyRaw >= minQty ? maxQtyRaw : undefined
    const unitPrice = Math.round(Number(tier.price_per_m2 || 0) * pieceAreaM2Value * 100) / 100
    mapped.push({
      min_qty: minQty,
      max_qty: maxQty,
      unit_price: unitPrice,
      source_min_m2: tier.min_m2,
      source_max_m2: tier.max_m2,
    })
  }

  const deduped = new Map<number, (typeof mapped)[number]>()
  for (const row of mapped) {
    const prev = deduped.get(row.min_qty)
    if (!prev) {
      deduped.set(row.min_qty, row)
      continue
    }
    if ((row.source_min_m2 ?? 0) > (prev.source_min_m2 ?? 0)) {
      deduped.set(row.min_qty, row)
    }
  }

  const compact = [...deduped.values()].sort((a, b) => a.min_qty - b.min_qty)
  for (let i = 0; i < compact.length - 1; i++) {
    compact[i].max_qty = compact[i + 1].min_qty - 1
  }
  if (compact.length > 0) compact[compact.length - 1].max_qty = undefined
  return compact
}

export class RollWideM2PricingService {
  static async loadRatesByTechnology(technologyCode: string): Promise<RollWideM2Rates | null> {
    const code = normalizeTechnologyCode(technologyCode)
    if (!code) return null

    const db = await getDb()
    const row = await db.get<{
      id: number
      technology_code: string
      price_color_per_m2: number | null
      min_charge: number | null
      max_width_mm: number | null
      max_height_mm: number | null
      m2_pricing_kind: 'roll_wide' | 'uv_flatbed' | null
      supports_bw: number | null
    }>(
      `SELECT
         pp.id,
         pp.technology_code,
         pp.price_color_per_m2,
         pp.min_charge,
         pp.max_width_mm,
         pp.max_height_mm,
         pp.m2_pricing_kind,
         pt.supports_bw
       FROM print_prices pp
       LEFT JOIN print_technologies pt
         ON LOWER(pt.code) = LOWER(pp.technology_code)
       WHERE LOWER(pp.technology_code) = LOWER(?)
         AND pp.is_active = 1
         AND pp.counter_unit = 'm2'
       ORDER BY
         CASE
           WHEN pp.m2_pricing_kind = 'roll_wide' THEN 0
           WHEN pp.m2_pricing_kind IS NULL THEN 1
           ELSE 2
         END,
         pp.id DESC
       LIMIT 1`,
      [code],
    )
    if (!row) return null

    let tiers: RollWideM2TierRow[] = []
    try {
      tiers = await db.all<RollWideM2TierRow[]>(
        `SELECT min_m2, max_m2, price_per_m2
         FROM print_price_roll_m2_tiers
         WHERE print_price_id = ?
         ORDER BY min_m2`,
        [row.id],
      )
    } catch {
      tiers = []
    }

    return {
      printPriceId: row.id,
      technologyCode: String(row.technology_code || code),
      price_color_per_m2: row.price_color_per_m2,
      min_charge: row.min_charge ?? 0,
      max_width_mm: row.max_width_mm ?? 1600,
      max_height_mm: row.max_height_mm ?? 50000,
      supports_bw: row.supports_bw == null ? true : Number(row.supports_bw) !== 0,
      m2PricingKind: row.m2_pricing_kind ?? null,
      tiers: Array.isArray(tiers) ? tiers : [],
    }
  }

  static async buildMissingRatesError(technologyCode: string): Promise<Error & { status?: number }> {
    const code = normalizeTechnologyCode(technologyCode)
    const db = await getDb()
    const existing = await db.get<{ counter_unit: string; m2_pricing_kind?: string | null }>(
      `SELECT counter_unit, m2_pricing_kind
       FROM print_prices
       WHERE LOWER(technology_code) = LOWER(?) AND is_active = 1
       ORDER BY id DESC LIMIT 1`,
      [code],
    )
    const err: Error & { status?: number } = new Error('')
    if (!existing) {
      err.message =
        `Цены по м² для технологии «${code}» не найдены. ` +
        'Создайте запись в Админ-панель → Принтеры → Цены печати с единицей «Кв. метры» и профилем «ШФП рулон».'
      err.status = 404
      return err
    }
    if (existing.counter_unit !== 'm2') {
      err.message =
        `Для технологии «${code}» активна цена с единицей «${existing.counter_unit}». ` +
        'Для рулонной ШФП по м² нужна запись с единицей «Кв. метры» и профилем «ШФП рулон».'
      err.status = 422
      return err
    }
    err.message =
      `Для технологии «${code}» не найден профиль «ШФП рулон» (m2_pricing_kind=roll_wide). ` +
      'Проверьте карточку цены печати и выберите правильный m²-профиль.'
    err.status = 422
    return err
  }

  static async calculate(params: {
    technologyCode: string
    trimWidthMm: number
    trimHeightMm: number
    quantity: number
    colorMode?: 'color' | 'bw'
    /** Суммарные м² группы — только lookup ступени (см. calculateRollWideM2Price). */
    tierM2Override?: number | null
  }): Promise<RollWideM2PricingResult> {
    const rates = await this.loadRatesByTechnology(params.technologyCode)
    if (!rates || rates.m2PricingKind !== 'roll_wide') {
      throw await this.buildMissingRatesError(params.technologyCode)
    }

    const colorMode = normalizeColorMode(params.colorMode)
    if (!rates.supports_bw && colorMode === 'bw') {
      const err: Error & { status?: number } = new Error(
        `Технология «${rates.technologyCode}» не поддерживает ч/б режим. Доступен только color.`,
      )
      err.status = 422
      throw err
    }

    if (!validateTrimFitsBed(params.trimWidthMm, params.trimHeightMm, rates.max_width_mm, rates.max_height_mm)) {
      const err: Error & { status?: number } = new Error(
        `Размер ${params.trimWidthMm}×${params.trimHeightMm} мм превышает ограничения оборудования ${rates.max_width_mm}×${rates.max_height_mm} мм.`,
      )
      err.status = 400
      throw err
    }

    const result = calculateRollWideM2Price({
      trimWidthMm: params.trimWidthMm,
      trimHeightMm: params.trimHeightMm,
      quantity: params.quantity,
      rates,
      tierM2Override: params.tierM2Override,
    })
    if (!Number.isFinite(result.ratePerM2) || result.ratePerM2 <= 0) {
      const err: Error & { status?: number } = new Error(
        `Для технологии «${rates.technologyCode}» не задана корректная color-ставка за м².`,
      )
      err.status = 422
      throw err
    }
    return result
  }
}

