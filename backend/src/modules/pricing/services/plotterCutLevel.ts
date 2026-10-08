/**
 * Уровни резки на рулонном плоттере: мельче элемент (меньше ячейка) — выше коэффициент к базовой ставке за п.м.
 * Правило: длинная сторона ячейки = max(trim_w, trim_h) + 2×bleed (мм).
 */

export type PlotterCutLevelRule = {
  /** Если длинная сторона ячейки ≤ этого порога (мм), применяется multiplier */
  max_cell_long_side_mm: number;
  /** Множитель к цене за п.м. (и к выбранному диапазону volume tier) */
  multiplier: number;
  name?: string;
};

/**
 * Правила сортируются по возрастанию порога; берётся первое, где cellLongSideMm ≤ max_cell_long_side_mm.
 * Задайте последнюю строку с большим порогом (напр. 9999) и multiplier 1 — для крупных форматов.
 */
export type PlotterCutLevelMatch = {
  multiplier: number;
  name: string | null;
  max_cell_long_side_mm: number | null;
};

function usableCutLevelRules(rules: PlotterCutLevelRule[] | undefined) {
  return [...(rules ?? [])]
    .map((r) => ({
      max: Number(r.max_cell_long_side_mm),
      mult: Number(r.multiplier),
      name: typeof r.name === 'string' ? r.name.trim() : '',
    }))
    .filter((r) => Number.isFinite(r.max) && r.max > 0 && Number.isFinite(r.mult) && r.mult > 0)
    .sort((a, b) => a.max - b.max);
}

export function resolveRollCutLevelMultiplier(
  cellLongSideMm: number,
  rules: PlotterCutLevelRule[] | undefined
): number {
  return matchPlotterCutLevel(cellLongSideMm, rules).multiplier;
}

/** Первое правило, чей порог ещё покрывает длинную сторону ячейки. */
export function matchPlotterCutLevel(
  cellLongSideMm: number,
  rules: PlotterCutLevelRule[] | undefined
): PlotterCutLevelMatch {
  const sorted = usableCutLevelRules(rules);
  if (!sorted.length) return { multiplier: 1, name: null, max_cell_long_side_mm: null };
  const x = Math.max(0, Number(cellLongSideMm) || 0);
  for (const r of sorted) {
    if (x <= r.max) {
      return { multiplier: r.mult, name: r.name || null, max_cell_long_side_mm: r.max };
    }
  }
  return { multiplier: 1, name: null, max_cell_long_side_mm: null };
}
