/**
 * УФ-планшет: расчёт печати по м² с независимыми слоями (цвет, белый, лак) и ступенями по total_m2.
 */

import { getDb } from '../../../db';

export type UvPrintLayer = 'color' | 'white' | 'varnish';

export interface UvLayerInput {
  enabled: boolean;
  passes: number;
}

export interface UvPrintConfiguration {
  color?: UvLayerInput;
  white?: UvLayerInput;
  varnish?: UvLayerInput;
}

export interface UvM2TierRow {
  layer: UvPrintLayer;
  min_m2: number;
  max_m2: number | null;
  price_per_m2: number;
}

export interface UvFlatbedRates {
  printPriceId: number;
  price_color_per_m2: number | null;
  price_white_per_m2: number | null;
  price_varnish_per_m2: number | null;
  min_charge: number;
  max_width_mm: number;
  max_height_mm: number;
  m2Tiers: UvM2TierRow[];
}

export interface UvLayerBreakdown {
  layer: UvPrintLayer;
  label: string;
  passes: number;
  ratePerM2: number;
  areaM2PerPiece: number;
  quantity: number;
  totalCost: number;
}

export interface UvFlatbedPricingResult {
  printPrice: number;
  pieceAreaM2: number;
  totalM2: number;
  minChargeApplied: boolean;
  layers: UvLayerBreakdown[];
}

const LAYER_LABELS: Record<UvPrintLayer, string> = {
  color: 'УФ-печать (цвет)',
  white: 'УФ-печать (белый)',
  varnish: 'УФ-лак',
};

const FLAT_RATE_KEYS: Record<UvPrintLayer, keyof UvFlatbedRates> = {
  color: 'price_color_per_m2',
  white: 'price_white_per_m2',
  varnish: 'price_varnish_per_m2',
};

export const UV_MAX_PASSES = 5;

export function pieceAreaM2(widthMm: number, heightMm: number): number {
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
    return 0;
  }
  return (widthMm * heightMm) / 1_000_000;
}

export function validateTrimFitsBed(
  widthMm: number,
  heightMm: number,
  maxW: number,
  maxH: number,
): boolean {
  const w = Math.min(widthMm, heightMm);
  const h = Math.max(widthMm, heightMm);
  const maxShort = Math.min(maxW, maxH);
  const maxLong = Math.max(maxW, maxH);
  return w <= maxShort && h <= maxLong;
}

export function lookupM2TierRate(
  tiers: UvM2TierRow[],
  layer: UvPrintLayer,
  totalM2: number,
): number | null {
  const layerTiers = tiers
    .filter((t) => t.layer === layer)
    .sort((a, b) => b.min_m2 - a.min_m2);
  if (layerTiers.length === 0) return null;
  for (const t of layerTiers) {
    if (totalM2 >= t.min_m2 && (t.max_m2 == null || totalM2 <= t.max_m2)) {
      return t.price_per_m2;
    }
  }
  const last = layerTiers[layerTiers.length - 1];
  return last?.price_per_m2 ?? null;
}

export function resolveLayerRate(
  rates: UvFlatbedRates,
  layer: UvPrintLayer,
  totalM2: number,
): number {
  const fromTier = lookupM2TierRate(rates.m2Tiers, layer, totalM2);
  if (fromTier != null && fromTier > 0) return fromTier;
  const flat = rates[FLAT_RATE_KEYS[layer]];
  return flat != null && Number.isFinite(Number(flat)) ? Number(flat) : 0;
}

export function normalizeUvPrintConfig(raw: UvPrintConfiguration | undefined | null): UvPrintConfiguration {
  const out: UvPrintConfiguration = {};
  for (const layer of ['color', 'white', 'varnish'] as UvPrintLayer[]) {
    const src = raw?.[layer];
    if (!src?.enabled) continue;
    const passes = Math.max(0, Math.min(UV_MAX_PASSES, Math.floor(Number(src.passes) || 0)));
    if (passes < 1) continue;
    out[layer] = { enabled: true, passes };
  }
  return out;
}

export function calculateUvFlatbedPrice(params: {
  trimWidthMm: number;
  trimHeightMm: number;
  quantity: number;
  uvPrint: UvPrintConfiguration;
  rates: UvFlatbedRates;
}): UvFlatbedPricingResult {
  const { trimWidthMm, trimHeightMm, quantity, rates } = params;
  const uvPrint = normalizeUvPrintConfig(params.uvPrint);
  const area = pieceAreaM2(trimWidthMm, trimHeightMm);
  const qty = Math.max(1, Math.floor(quantity));
  const totalM2 = area * qty;

  const layers: UvLayerBreakdown[] = [];
  let subtotal = 0;

  for (const layer of ['color', 'white', 'varnish'] as UvPrintLayer[]) {
    const cfg = uvPrint[layer];
    if (!cfg?.enabled || cfg.passes < 1) continue;
    const rate = resolveLayerRate(rates, layer, totalM2);
    const layerCost = rate * area * cfg.passes * qty;
    subtotal += layerCost;
    layers.push({
      layer,
      label: LAYER_LABELS[layer],
      passes: cfg.passes,
      ratePerM2: rate,
      areaM2PerPiece: area,
      quantity: qty,
      totalCost: Math.round(layerCost * 100) / 100,
    });
  }

  const minCharge = Math.max(0, Number(rates.min_charge) || 0);
  const roundedSubtotal = Math.round(subtotal * 100) / 100;
  const minChargeApplied = minCharge > 0 && roundedSubtotal < minCharge;
  const printPrice = minChargeApplied ? minCharge : roundedSubtotal;

  return {
    printPrice: Math.round(printPrice * 100) / 100,
    pieceAreaM2: area,
    totalM2,
    minChargeApplied,
    layers,
  };
}

export class UvFlatbedPricingService {
  static async loadRatesByTechnology(technologyCode: string): Promise<UvFlatbedRates | null> {
    const db = await getDb();
    const pp = await db.get<{
      id: number;
      counter_unit: string;
      price_color_per_m2: number | null;
      price_white_per_m2: number | null;
      price_varnish_per_m2: number | null;
      min_charge: number | null;
      max_width_mm: number | null;
      max_height_mm: number | null;
    }>(
      `SELECT id, counter_unit, price_color_per_m2, price_white_per_m2, price_varnish_per_m2,
              min_charge, max_width_mm, max_height_mm
       FROM print_prices
       WHERE technology_code = ? AND is_active = 1
       ORDER BY id DESC LIMIT 1`,
      technologyCode,
    );
    if (!pp || pp.counter_unit !== 'm2') return null;

    let m2Tiers: UvM2TierRow[] = [];
    try {
      m2Tiers = await db.all<UvM2TierRow[]>(
        `SELECT layer, min_m2, max_m2, price_per_m2
         FROM print_price_m2_tiers
         WHERE print_price_id = ?
         ORDER BY layer, min_m2`,
        pp.id,
      );
    } catch {
      m2Tiers = [];
    }

    return {
      printPriceId: pp.id,
      price_color_per_m2: pp.price_color_per_m2,
      price_white_per_m2: pp.price_white_per_m2,
      price_varnish_per_m2: pp.price_varnish_per_m2,
      min_charge: pp.min_charge ?? 0,
      max_width_mm: pp.max_width_mm ?? 600,
      max_height_mm: pp.max_height_mm ?? 900,
      m2Tiers: Array.isArray(m2Tiers) ? m2Tiers : [],
    };
  }

  static async calculate(params: {
    technologyCode: string;
    trimWidthMm: number;
    trimHeightMm: number;
    quantity: number;
    uvPrint: UvPrintConfiguration;
  }): Promise<UvFlatbedPricingResult> {
    const rates = await this.loadRatesByTechnology(params.technologyCode);
    if (!rates) {
      const err: Error & { status?: number } = new Error(
        `Цены УФ (м²) для технологии «${params.technologyCode}» не найдены в центре цен`,
      );
      err.status = 404;
      throw err;
    }
    if (!validateTrimFitsBed(params.trimWidthMm, params.trimHeightMm, rates.max_width_mm, rates.max_height_mm)) {
      const err: Error & { status?: number } = new Error(
        `Размер ${params.trimWidthMm}×${params.trimHeightMm} мм не помещается на стол ${rates.max_width_mm}×${rates.max_height_mm} мм`,
      );
      err.status = 400;
      throw err;
    }
    const uvPrint = normalizeUvPrintConfig(params.uvPrint);
    if (Object.keys(uvPrint).length === 0) {
      const err: Error & { status?: number } = new Error(
        'Укажите хотя бы один слой УФ-печати с числом проходов ≥ 1',
      );
      err.status = 400;
      throw err;
    }
    return calculateUvFlatbedPrice({
      trimWidthMm: params.trimWidthMm,
      trimHeightMm: params.trimHeightMm,
      quantity: params.quantity,
      uvPrint,
      rates,
    });
  }
}
