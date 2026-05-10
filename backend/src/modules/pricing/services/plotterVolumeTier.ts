/**
 * Объёмные ступени тарифа плоттера (тиражные скидки) и выбор строки диапазона.
 */

import type {
  PlotterCuttingModeTariffDTO,
  PlotterVolumeTierBasis,
} from '../dtos/plotterCuttingTariff.dto';

export type PlotterTierSlice = {
  min_qty: number;
  max_qty?: number;
  unit_price: number;
};

export function buildPlotterTiersFromDto(t: PlotterCuttingModeTariffDTO): PlotterTierSlice[] {
  if (t.volume_tiers && t.volume_tiers.length > 0) {
    const sorted = [...t.volume_tiers].sort((a, b) => a.min_quantity - b.min_quantity);
    return sorted.map((row) => ({
      min_qty: row.min_quantity,
      unit_price: row.price_per_unit,
    }));
  }
  return [{ min_qty: 1, unit_price: t.price_per_meter }];
}

/**
 * Ступени вида min₀=0, min₁=0.5… — выбирается последняя ступень с min ≤ qty (как «тиражная сетка»).
 */
export function findPlotterVolumeTier(tiers: PlotterTierSlice[], qty: number): PlotterTierSlice | null {
  if (!tiers?.length) return null;
  const asc = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
  let pick = asc[0];
  for (const t of asc) {
    if (qty >= t.min_qty) pick = t;
  }
  return pick;
}

export function resolvePlotterTierVolumeQty(params: {
  basis: PlotterVolumeTierBasis | null | undefined;
  tariffMeterBasis: 'knife_path' | 'feed';
  knifePathM: number;
  feedM: number;
  cutAreaM2: number;
}): number {
  const { basis, tariffMeterBasis, knifePathM, feedM, cutAreaM2 } = params;
  if (basis === 'cut_area_m2') return cutAreaM2;
  if (basis === 'feed_m') return feedM;
  if (basis === 'knife_m') return knifePathM;
  return tariffMeterBasis === 'feed' ? feedM : knifePathM;
}
