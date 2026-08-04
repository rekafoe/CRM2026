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

export type RollFeedMetersInput = {
  rollWidthMm: number;
  trimMm: { width: number; height: number };
  bleedMm: number;
  quantity: number;
  margins: PlotterMargins;
};

export type RollFeedMetersResult = {
  /** Погонные метры подачи рулона */
  feedMeters: number;
  /** Длина подачи в мм */
  feedLengthMm: number;
  /** Погонные метры на одно изделие */
  metersPerItem: number;
  /** Количество изделий поперек рулона */
  cols: number;
  /** Количество рядов по подаче */
  rowsFeed: number;
  /** Выбранная ориентация изделия на рулоне */
  orientation: 'normal' | 'rotated';
  /** Списываемая площадь рулона: ширина рулона × длина подачи */
  totalAreaM2: number;
};

type RollFeedVariant = {
  orientation: 'normal' | 'rotated';
  feedLengthMm: number;
  cols: number;
  rowsFeed: number;
  totalAreaM2: number;
  feedMeters: number;
  metersPerItem: number;
};

function evalRollFeedVariant(params: {
  orientation: 'normal' | 'rotated';
  rollWidthMm: number;
  usableWidthMm: number;
  pieceAcrossMm: number;
  pieceFeedMm: number;
  gapMm: number;
  edgeMm: number;
  quantity: number;
}): RollFeedVariant | null {
  const {
    orientation,
    rollWidthMm,
    usableWidthMm,
    pieceAcrossMm,
    pieceFeedMm,
    gapMm,
    edgeMm,
    quantity,
  } = params;
  if (pieceAcrossMm <= 0 || pieceFeedMm <= 0 || usableWidthMm <= 0) return null;
  const pitchAcross = pieceAcrossMm + gapMm;
  if (pitchAcross <= 0) return null;

  // +gap в числителе учитывает отсутствие зазора после последней колонки.
  const cols = Math.floor((usableWidthMm + gapMm) / pitchAcross);
  if (!Number.isFinite(cols) || cols <= 0) return null;

  const rowsFeed = Math.ceil(quantity / cols);
  const feedLengthMm = rowsFeed * pieceFeedMm + Math.max(0, rowsFeed - 1) * gapMm + 2 * edgeMm;
  const feedMeters = feedLengthMm / 1000;
  const totalAreaM2 = (rollWidthMm * feedLengthMm) / 1_000_000;

  return {
    orientation,
    feedLengthMm,
    cols,
    rowsFeed,
    totalAreaM2,
    feedMeters,
    metersPerItem: quantity > 0 ? feedMeters / quantity : 0,
  };
}

/**
 * Оптимальный расход рулона (пог. м) с учетом поворота 90°.
 * Используется для списания материала: ширина рулона × длина подачи.
 */
export function computeOptimizedRollFeedMeters(input: RollFeedMetersInput): RollFeedMetersResult | null {
  const { cellW, cellH } = cellSize(input.trimMm, input.bleedMm);
  const gapMm = Math.max(0, Number(input.margins?.gapMm) || 0);
  const edgeMm = Math.max(0, Number(input.margins?.edgeMm) || 0);
  const rollWidthMm = Math.max(0, Number(input.rollWidthMm) || 0);
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 0));
  const usableWidthMm = rollWidthMm - 2 * edgeMm;
  if (rollWidthMm <= 0 || usableWidthMm <= 0 || quantity <= 0) return null;

  const normal = evalRollFeedVariant({
    orientation: 'normal',
    rollWidthMm,
    usableWidthMm,
    pieceAcrossMm: cellW,
    pieceFeedMm: cellH,
    gapMm,
    edgeMm,
    quantity,
  });

  const rotated = evalRollFeedVariant({
    orientation: 'rotated',
    rollWidthMm,
    usableWidthMm,
    pieceAcrossMm: cellH,
    pieceFeedMm: cellW,
    gapMm,
    edgeMm,
    quantity,
  });

  const candidates = [normal, rotated].filter((v): v is RollFeedVariant => v != null);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (Math.abs(a.feedLengthMm - b.feedLengthMm) > 0.0001) {
      return a.feedLengthMm - b.feedLengthMm;
    }
    if (a.cols !== b.cols) return b.cols - a.cols;
    return a.totalAreaM2 - b.totalAreaM2;
  });

  const best = candidates[0];
  return {
    feedMeters: best.feedMeters,
    feedLengthMm: best.feedLengthMm,
    metersPerItem: best.metersPerItem,
    cols: best.cols,
    rowsFeed: best.rowsFeed,
    orientation: best.orientation,
    totalAreaM2: best.totalAreaM2,
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
