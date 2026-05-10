/**
 * Уровни резки на рулонном плоттере: мельче элемент (меньше ячейка) — выше коэффициент к базовой ставке за п.м.
 * Правило: длинная сторона ячейки = max(trim_w, trim_h) + 2×bleed (мм).
 */

export type PlotterCutLevelRule = {
  /** Если длинная сторона ячейки ≤ этого порога (мм), применяется multiplier */
  max_cell_long_side_mm: number;
  /** Множитель к цене за п.м. (и к выбранному диапазону volume tier) */
  multiplier: number;
};

/**
 * Правила сортируются по возрастанию порога; берётся первое, где cellLongSideMm ≤ max_cell_long_side_mm.
 * Задайте последнюю строку с большим порогом (напр. 9999) и multiplier 1 — для крупных форматов.
 */
export function resolveRollCutLevelMultiplier(
  cellLongSideMm: number,
  rules: PlotterCutLevelRule[] | undefined
): number {
  if (!rules?.length) return 1;
  const x = Math.max(0, Number(cellLongSideMm) || 0);
  const sorted = [...rules]
    .map((r) => ({
      max: Number(r.max_cell_long_side_mm),
      mult: Number(r.multiplier),
    }))
    .filter((r) => Number.isFinite(r.max) && r.max > 0 && Number.isFinite(r.mult) && r.mult > 0)
    .sort((a, b) => a.max - b.max);
  if (!sorted.length) return 1;
  for (const r of sorted) {
    if (x <= r.max) return r.mult;
  }
  return 1;
}
