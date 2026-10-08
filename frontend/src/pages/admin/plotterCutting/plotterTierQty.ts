import type { PlotterCuttingModeTariffApi } from '../../../services/pricing';

/** Порог тиража (шт от) → ставка при расчёте per_item для плоттера выборки/накатки. */
export function tierRateAtOrderQty(
  rows: Array<{ min_quantity: number; price_per_unit: number }>,
  qty: number,
): number {
  const asc = [...rows].sort((a, b) => a.min_quantity - b.min_quantity);
  if (!asc.length) return 0;
  let pick = asc[0];
  for (const t of asc) if (qty >= t.min_quantity) pick = t;
  return Number(pick.price_per_unit ?? 0);
}

export function plotterVolumeTierThresholdTitle(
  volumeTierBasis: PlotterCuttingModeTariffApi['volume_tier_basis'],
  meterBasis: PlotterCuttingModeTariffApi['meter_basis'],
): string {
  if (volumeTierBasis === 'knife_m' || volumeTierBasis === 'cut_area_m2') return 'Мин. площадь изделий (м²)';
  if (volumeTierBasis === 'feed_m') return 'Мин. подача (м)';
  return meterBasis === 'feed' ? 'Мин. подача (м)' : 'Мин. площадь изделий (м²)';
}

export function plotterVolumeTierTableHint(
  volumeTierBasis: PlotterCuttingModeTariffApi['volume_tier_basis'],
): string {
  if (volumeTierBasis === 'cut_area_m2') {
    return 'Пусто — одна ставка «Цена за п.м. (база)». Иначе действует строка с наибольшим порогом ≤ объёма (площадь изделия trim × тираж, м²). Порог 0 — малые объёмы.';
  }
  return 'Пусто — одна ставка «Цена за п.м. (база)». Иначе действует строка с наибольшим порогом ≤ объёма (ось из «Ось тиражных ступеней» или как основа метража). Порог 0 — малые объёмы.';
}
