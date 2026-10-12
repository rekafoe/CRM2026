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

/** Минимальный кусок рулона в резке: ширина 1,2 м и закладка 0,25 м. */
export const PLOTTER_MIN_ROLL_WIDTH_M = 1.2;
export const PLOTTER_MIN_LAY_M = 0.25;
export const PLOTTER_MIN_CUT_AREA_M2 = PLOTTER_MIN_ROLL_WIDTH_M * PLOTTER_MIN_LAY_M;

/** Площадь резки рулона: не меньше 0,3 м² и не меньше минимума тарифа. */
export function billPlotterRollCutAreaM2(productAreaM2: number, adminMinM2?: number | null): number {
  const area = Math.max(0, Number(productAreaM2) || 0);
  const admin = Number(adminMinM2);
  const adminFloor = Number.isFinite(admin) && admin > 0 ? admin : 0;
  return Math.max(area, PLOTTER_MIN_CUT_AREA_M2, adminFloor);
}

export function resolvePlotterTierVolumeQty(params: {
  basis: PlotterVolumeTierBasis | null | undefined;
  tariffMeterBasis: 'knife_path' | 'feed';
  knifePathM: number;
  feedM: number;
  cutAreaM2: number;
}): number {
  const { basis, tariffMeterBasis, feedM, cutAreaM2 } = params;
  if (basis === 'cut_area_m2' || basis === 'knife_m') return cutAreaM2;
  if (basis === 'feed_m') return feedM;
  return tariffMeterBasis === 'feed' ? feedM : cutAreaM2;
}
