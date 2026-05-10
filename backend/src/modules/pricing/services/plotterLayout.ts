/**
 * Раскладка и оценка пробега ножа плоттера (рулон / лист).
 * Дефолты полей: рулон 10 мм от края, зазор 2 мм; лист 15 мм, зазор 4 мм.
 * Листовой плоттер в типовом сценарии — лист SRA3 320×450 мм (см. SHEET_PLOTTER_SRA3_MM).
 */

export type PlotterMode = 'sheet' | 'roll';

/** Типовой носитель листового плоттера: SRA3. */
export const SHEET_PLOTTER_SRA3_MM = { width: 320, height: 450 } as const;

/** Поля от края рулона/листа и зазор между этикетками (мм). */
export const PLOTTER_DEFAULTS = {
  roll: { edgeMm: 10, gapMm: 2 },
  sheet: { edgeMm: 15, gapMm: 4 },
} as const;

export type PlotterMargins = { edgeMm: number; gapMm: number };

export function resolvePlotterMargins(
  mode: PlotterMode,
  cutMarginMm?: number | null,
  cutGapMm?: number | null
): PlotterMargins {
  const d = mode === 'roll' ? PLOTTER_DEFAULTS.roll : PLOTTER_DEFAULTS.sheet;
  const edgeMm =
    cutMarginMm != null && Number.isFinite(Number(cutMarginMm)) && Number(cutMarginMm) > 0
      ? Number(cutMarginMm)
      : d.edgeMm;
  const gapMm =
    cutGapMm != null && Number.isFinite(Number(cutGapMm)) && Number(cutGapMm) >= 0
      ? Number(cutGapMm)
      : d.gapMm;
  return { edgeMm, gapMm };
}

export type KnifePathRollInput = {
  rollWidthMm: number;
  trimMm: { width: number; height: number };
  bleedMm: number;
  quantity: number;
  margins: PlotterMargins;
};

export type KnifePathSheetInput = {
  sheetMm: { width: number; height: number };
  trimMm: { width: number; height: number };
  bleedMm: number;
  quantity: number;
  margins: PlotterMargins;
};

export type KnifePathResult = {
  knifePathM: number;
  cols: number;
  rowsFeed: number;
  /** Шт на один «полный» ряд поперёк рулона или на лист (для листа — на лист). */
  itemsPerBand: number;
  sheetsNeeded?: number;
};

/**
 * Ячейка: trim + 2×bleed; шаг в сетке — как в LayoutCalculationService: (cell + gap).
 */
function cellSize(trimMm: { width: number; height: number }, bleedMm: number) {
  const b = Math.max(0, Number(bleedMm) || 0);
  return {
    cellW: trimMm.width + 2 * b,
    cellH: trimMm.height + 2 * b,
  };
}

/**
 * Рулон: сетка по ширине, ряды по подаче; пробег ножа v1 по плану (периметр + «улицы»).
 */
export function computeKnifePathMetersRoll(input: KnifePathRollInput): KnifePathResult {
  const { cellW, cellH } = cellSize(input.trimMm, input.bleedMm);
  const gap = input.margins.gapMm;
  const edge = input.margins.edgeMm;
  const Wroll = Math.max(0, Number(input.rollWidthMm) || 0);
  const Wuse = Math.max(0, Wroll - 2 * edge);
  const q = Math.max(1, Math.floor(Number(input.quantity) || 0));

  const pitchW = cellW + gap;
  const cols = Math.max(1, Math.floor(Wuse / pitchW));
  const rowsFeed = Math.ceil(q / cols);

  const Pcell = 2 * (cellW + cellH);
  const usableWidth = cols * cellW + Math.max(0, cols - 1) * gap;
  const streetH = Math.max(0, rowsFeed - 1) * usableWidth;
  const streetV = Math.max(0, cols - 1) * rowsFeed * (cellH + gap);
  const knifeMm = q * Pcell + streetH + streetV;

  return {
    knifePathM: knifeMm / 1000,
    cols,
    rowsFeed,
    itemsPerBand: cols,
  };
}

/**
 * Лист: сколько помещается на листе; пробег = на лист × число листов.
 */
export function computeKnifePathMetersSheet(input: KnifePathSheetInput): KnifePathResult {
  const { cellW, cellH } = cellSize(input.trimMm, input.bleedMm);
  const gap = input.margins.gapMm;
  const edge = input.margins.edgeMm;
  const sw = Math.max(0, input.sheetMm.width - 2 * edge);
  const sh = Math.max(0, input.sheetMm.height - 2 * edge);
  const pitchW = cellW + gap;
  const pitchH = cellH + gap;
  const cols = Math.max(0, Math.floor(sw / pitchW));
  const rows = Math.max(0, Math.floor(sh / pitchH));
  const itemsPerSheet = cols * rows;
  const q = Math.max(1, Math.floor(Number(input.quantity) || 0));

  if (cols === 0 || rows === 0 || itemsPerSheet === 0) {
    return {
      knifePathM: 0,
      cols: Math.max(1, cols),
      rowsFeed: Math.max(1, rows),
      itemsPerBand: Math.max(1, itemsPerSheet || 1),
      sheetsNeeded: q,
    };
  }

  const sheetsNeeded = Math.ceil(q / itemsPerSheet);
  const Pcell = 2 * (cellW + cellH);
  const usableWidth = cols * cellW + Math.max(0, cols - 1) * gap;
  const streetH = Math.max(0, rows - 1) * usableWidth;
  const streetV = Math.max(0, cols - 1) * rows * (cellH + gap);
  const knifePerSheetMm = itemsPerSheet * Pcell + streetH + streetV;

  return {
    knifePathM: (knifePerSheetMm * sheetsNeeded) / 1000,
    cols,
    rowsFeed: rows,
    itemsPerBand: itemsPerSheet,
    sheetsNeeded,
  };
}
