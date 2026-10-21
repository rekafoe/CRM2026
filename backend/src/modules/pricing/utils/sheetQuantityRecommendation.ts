export type SheetQuantityRecommendation = {
  itemsPerSheet: number;
  /** Количество, по которому посчитана цена. Ниже листа это полный лист. */
  pricedQuantity: number;
  /** Тираж меньше одного листа. */
  recommendedQuantity?: number;
  /** Ближний меньший тираж, кратный раскладке. */
  lowerQuantity?: number;
  /** Ближний больший тираж, кратный раскладке. */
  higherQuantity?: number;
};

/**
 * Раскладка «шт/лист» не запрещает другой тираж.
 * Меньше листа — рекомендуем один лист. Между листами — соседние кратные значения.
 * Точное число листов подсказку не требует.
 */
export function sheetQuantityRecommendation(
  quantity: number,
  itemsPerSheet: number,
): SheetQuantityRecommendation | null {
  const step = Math.floor(Number(itemsPerSheet));
  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(step) || step <= 1) return null;
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (qty % step === 0) return null;
  if (qty < step) {
    return {
      itemsPerSheet: step,
      pricedQuantity: step,
      recommendedQuantity: step,
    };
  }
  return {
    itemsPerSheet: step,
    pricedQuantity: qty,
    lowerQuantity: Math.floor(qty / step) * step,
    higherQuantity: Math.ceil(qty / step) * step,
  };
}
