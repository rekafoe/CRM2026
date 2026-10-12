export type PlotterCuttingMeterBasis = 'knife_path' | 'feed';

/** Ось объёма для выбора строки volume_tiers (тиражная скидка). Пусто — как meter_basis тарифа. */
export type PlotterVolumeTierBasis = 'knife_m' | 'feed_m' | 'cut_area_m2';

export interface PlotterCuttingModeTariffDTO {
  mode: 'roll' | 'sheet';
  label: string;
  price_per_meter: number;
  meter_basis: PlotterCuttingMeterBasis;
  /** По какой величине выбирать строку volume_tiers. knife_m оставлен в базе и считается как площадь, м². */
  volume_tier_basis?: PlotterVolumeTierBasis | null;
  min_quantity: number;
  max_quantity?: number | null;
  operator_percent?: number | null;
  material_id?: number | null;
  qty_per_item?: number | null;
  /** Только рулон: ставка выборки за м² при пороге 1 м². Имя поля старое, для совместимости API. */
  weeding_price_per_item?: number | null;
  /** Только рулон: ставка накатки за м² при пороге 1 м². Имя поля старое, для совместимости API. */
  mounting_price_per_item?: number | null;
  /** Только рулон: порог площади (м²) × цена за м². Уровень резки умножает эту ставку. */
  weeding_tiers?: Array<{ min_quantity: number; price_per_unit: number }>;
  /** Только рулон: порог площади (м²) × цена за м². Уровень резки не умножает. */
  mounting_tiers?: Array<{ min_quantity: number; price_per_unit: number }>;
  /** Только рулон: проверка макета, порог тиража × цена за изделие. */
  proof_tiers?: Array<{ min_quantity: number; price_per_unit: number }>;
  proof_price_per_item?: number | null;
  /** Диапазоны цен по тиражу; пусто — одна ставка price_per_meter */
  volume_tiers?: Array<{ min_quantity: number; price_per_unit: number }>;
  /**
   * Уровни резки — чем меньше ячейка, тем выше multiplier к цене за м².
   * Сравнение по длинной стороне ячейки (мм): max(trim_w, trim_h) + 2×bleed.
   */
  cut_level_rules?: Array<{ max_cell_long_side_mm: number; multiplier: number; name?: string }>;
}

export interface PlotterCuttingTariffsBundleDTO {
  roll: PlotterCuttingModeTariffDTO;
  sheet: PlotterCuttingModeTariffDTO;
}
