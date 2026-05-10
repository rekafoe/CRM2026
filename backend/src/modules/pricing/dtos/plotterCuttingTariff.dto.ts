export type PlotterCuttingMeterBasis = 'knife_path' | 'feed';

/** Ось объёма для выбора строки volume_tiers (тиражная скидка). Пусто — как meter_basis тарифа. */
export type PlotterVolumeTierBasis = 'knife_m' | 'feed_m' | 'cut_area_m2';

export interface PlotterCuttingModeTariffDTO {
  mode: 'roll' | 'sheet';
  label: string;
  price_per_meter: number;
  meter_basis: PlotterCuttingMeterBasis;
  /** По какой величине выбирать строку volume_tiers; не задано — совпадает с meter_basis (п.м. ножа или подачи). */
  volume_tier_basis?: PlotterVolumeTierBasis | null;
  min_quantity: number;
  max_quantity?: number | null;
  operator_percent?: number | null;
  material_id?: number | null;
  qty_per_item?: number | null;
  /** Только рулон: ставка выборки за изделие (деривируется из мыeding_tiers при сохранении; для совместимости API). */
  weeding_price_per_item?: number | null;
  /** Только рулон: ставка накатки за изделие (как мыeding_*). */
  mounting_price_per_item?: number | null;
  /** Только рулон: порог тиража (шт от) × цена за изделие. Пусто — как одна ставка из weeding_price_per_item или 0. */
  weeding_tiers?: Array<{ min_quantity: number; price_per_unit: number }>;
  mounting_tiers?: Array<{ min_quantity: number; price_per_unit: number }>;
  /** Диапазоны цен по тиражу; пусто — одна ставка price_per_meter */
  volume_tiers?: Array<{ min_quantity: number; price_per_unit: number }>;
  /**
   * Только рулон: уровни резки — чем меньше ячейка, тем выше multiplier к цене за п.м.
   * Сравнение по длинной стороне ячейки (мм): max(trim_w, trim_h) + 2×bleed.
   */
  cut_level_rules?: Array<{ max_cell_long_side_mm: number; multiplier: number }>;
}

export interface PlotterCuttingTariffsBundleDTO {
  roll: PlotterCuttingModeTariffDTO;
  sheet: PlotterCuttingModeTariffDTO;
}
