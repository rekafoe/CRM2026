import type { PlotterCuttingModeTariffApi } from '../../../services/pricing';

export type PlotterRateRow = { min_quantity: number; price_per_unit: number };
export type PlotterMeasure = 'knife_path' | 'feed';

export function visibleCuttingRows(tariff: Pick<PlotterCuttingModeTariffApi, 'price_per_meter' | 'volume_tiers'>): PlotterRateRow[] {
  const tiers = [...(tariff.volume_tiers ?? [])]
    .filter((row) => Number.isFinite(row.min_quantity) && Number.isFinite(row.price_per_unit))
    .sort((a, b) => a.min_quantity - b.min_quantity);
  if (tiers.length === 0) {
    return [{ min_quantity: 0, price_per_unit: Number(tariff.price_per_meter) || 0 }];
  }
  return tiers;
}

/** Одна строка «от 0» остаётся базовой ставкой. Несколько порогов пишутся в ступени, база — цена первой строки. */
export function commitCuttingRows(
  tariff: PlotterCuttingModeTariffApi,
  rows: PlotterRateRow[],
): PlotterCuttingModeTariffApi {
  const sorted = [...rows]
    .filter((row) => Number.isFinite(row.min_quantity) && Number.isFinite(row.price_per_unit))
    .sort((a, b) => a.min_quantity - b.min_quantity);
  if (sorted.length === 0) {
    return { ...tariff, price_per_meter: 0, volume_tiers: [] };
  }
  if (sorted.length === 1 && sorted[0].min_quantity <= 0) {
    return { ...tariff, price_per_meter: sorted[0].price_per_unit, volume_tiers: [] };
  }
  return {
    ...tariff,
    price_per_meter: sorted[0].price_per_unit,
    volume_tiers: sorted,
  };
}

export function applyMeasure(
  tariff: PlotterCuttingModeTariffApi,
  measure: PlotterMeasure,
): PlotterCuttingModeTariffApi {
  const area = tariff.volume_tier_basis === 'cut_area_m2';
  return {
    ...tariff,
    meter_basis: measure,
    volume_tier_basis: area ? 'cut_area_m2' : measure === 'feed' ? 'feed_m' : 'knife_m',
  };
}

export function applyAreaDiscount(
  tariff: PlotterCuttingModeTariffApi,
  enabled: boolean,
): PlotterCuttingModeTariffApi {
  if (enabled) return { ...tariff, volume_tier_basis: 'cut_area_m2' };
  return {
    ...tariff,
    volume_tier_basis: tariff.meter_basis === 'feed' ? 'feed_m' : 'knife_m',
  };
}

export function measureLabel(measure: PlotterMeasure): string {
  return measure === 'feed' ? 'подаче плёнки' : 'длине реза';
}
