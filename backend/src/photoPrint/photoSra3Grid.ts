export const SRA3_WIDTH_MM = 320;
export const SRA3_HEIGHT_MM = 450;
export const PHOTO_TECHNICAL_MARGIN_MM = 5;
export const PHOTO_BLEED_MM = 2;
/** Между соседними линиями реза: по 2 мм bleed каждого изделия. */
export const PHOTO_SAFE_GAP_MM = PHOTO_BLEED_MM * 2;
export const PHOTO_GAP_MM = PHOTO_SAFE_GAP_MM;

const EPSILON_MM = 1e-7;

export type PhotoLayoutItem = {
  widthMm: number;
  heightMm: number;
  allowRotation?: boolean;
};

export type PhotoPlacement<T extends PhotoLayoutItem> = {
  item?: T;
  /** Координата левого края trim, не bleed. */
  xMm: number;
  /** Координата верхнего края trim, не bleed. */
  yMm: number;
  widthMm: number;
  heightMm: number;
  /** Готовый отпечаток целиком повёрнут на 90° относительно исходной ориентации item. */
  rotated: boolean;
  isBlank?: boolean;
  slotIndex?: number;
};

export type Sra3SheetOrientation = 'portrait' | 'landscape';

export type PhotoSra3GridConfig = {
  sheetWidthMm: number;
  sheetHeightMm: number;
  sheetOrientation: Sra3SheetOrientation;
  trimWidthMm: number;
  trimHeightMm: number;
  cellWidthMm: number;
  cellHeightMm: number;
  cols: number;
  rows: number;
  capacity: number;
  rotated: boolean;
  technicalMarginMm: number;
  bleedMm: number;
  /** Левый край первой bleed-ячейки. */
  gridBleedXMm: number;
  /** Верхний край первой bleed-ячейки. */
  gridBleedYMm: number;
  usedBleedWidthMm: number;
  usedBleedHeightMm: number;
};

export type PhotoSra3GridPage<T extends PhotoLayoutItem> = {
  config: PhotoSra3GridConfig;
  placements: PhotoPlacement<T>[];
};

export type ChoosePhotoSra3GridOptions = {
  trimWidthMm: number;
  trimHeightMm: number;
  allowRotation?: boolean;
  technicalMarginMm?: number;
  bleedMm?: number;
};

function positiveMm(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} должен быть положительным числом`);
  }
  return value;
}

function candidateKey(config: PhotoSra3GridConfig): string {
  return [
    config.sheetOrientation,
    config.trimWidthMm.toFixed(4),
    config.trimHeightMm.toFixed(4),
  ].join(':');
}

function compareGridCandidates(a: PhotoSra3GridConfig, b: PhotoSra3GridConfig): number {
  if (a.capacity !== b.capacity) return b.capacity - a.capacity;

  const cutsA = Math.max(0, a.cols - 1) + Math.max(0, a.rows - 1);
  const cutsB = Math.max(0, b.cols - 1) + Math.max(0, b.rows - 1);
  if (cutsA !== cutsB) return cutsA - cutsB;

  const minOuterA = Math.min(
    a.gridBleedXMm,
    a.gridBleedYMm,
    a.sheetWidthMm - a.gridBleedXMm - a.usedBleedWidthMm,
    a.sheetHeightMm - a.gridBleedYMm - a.usedBleedHeightMm
  );
  const minOuterB = Math.min(
    b.gridBleedXMm,
    b.gridBleedYMm,
    b.sheetWidthMm - b.gridBleedXMm - b.usedBleedWidthMm,
    b.sheetHeightMm - b.gridBleedYMm - b.usedBleedHeightMm
  );
  if (Math.abs(minOuterA - minOuterB) > EPSILON_MM) return minOuterB - minOuterA;

  if (a.sheetOrientation !== b.sheetOrientation) {
    return a.sheetOrientation === 'portrait' ? -1 : 1;
  }
  if (a.rotated !== b.rotated) return a.rotated ? -1 : 1;
  return candidateKey(a).localeCompare(candidateKey(b));
}

function buildCandidate(params: {
  sheetWidthMm: number;
  sheetHeightMm: number;
  sheetOrientation: Sra3SheetOrientation;
  trimWidthMm: number;
  trimHeightMm: number;
  sourceWidthMm: number;
  sourceHeightMm: number;
  technicalMarginMm: number;
  bleedMm: number;
}): PhotoSra3GridConfig | null {
  const usableWidthMm = params.sheetWidthMm - params.technicalMarginMm * 2;
  const usableHeightMm = params.sheetHeightMm - params.technicalMarginMm * 2;
  const cellWidthMm = params.trimWidthMm + params.bleedMm * 2;
  const cellHeightMm = params.trimHeightMm + params.bleedMm * 2;
  if (usableWidthMm <= 0 || usableHeightMm <= 0) return null;

  const cols = Math.floor((usableWidthMm + EPSILON_MM) / cellWidthMm);
  const rows = Math.floor((usableHeightMm + EPSILON_MM) / cellHeightMm);
  if (cols <= 0 || rows <= 0) return null;

  const usedBleedWidthMm = cols * cellWidthMm;
  const usedBleedHeightMm = rows * cellHeightMm;
  const gridBleedXMm =
    params.technicalMarginMm + (usableWidthMm - usedBleedWidthMm) / 2;
  const gridBleedYMm =
    params.technicalMarginMm + (usableHeightMm - usedBleedHeightMm) / 2;
  const rotated =
    Math.abs(params.trimWidthMm - params.sourceWidthMm) > EPSILON_MM ||
    Math.abs(params.trimHeightMm - params.sourceHeightMm) > EPSILON_MM;

  return {
    sheetWidthMm: params.sheetWidthMm,
    sheetHeightMm: params.sheetHeightMm,
    sheetOrientation: params.sheetOrientation,
    trimWidthMm: params.trimWidthMm,
    trimHeightMm: params.trimHeightMm,
    cellWidthMm,
    cellHeightMm,
    cols,
    rows,
    capacity: cols * rows,
    rotated,
    technicalMarginMm: params.technicalMarginMm,
    bleedMm: params.bleedMm,
    gridBleedXMm,
    gridBleedYMm,
    usedBleedWidthMm,
    usedBleedHeightMm,
  };
}

/**
 * Подбирает одну однородную гильотинную сетку для всего тиража формата.
 * Техническое поле измеряется от края листа до внешнего края bleed.
 */
export function choosePhotoSra3Grid(
  options: ChoosePhotoSra3GridOptions
): PhotoSra3GridConfig {
  const trimWidthMm = positiveMm(options.trimWidthMm, 'trimWidthMm');
  const trimHeightMm = positiveMm(options.trimHeightMm, 'trimHeightMm');
  const technicalMarginMm =
    options.technicalMarginMm == null
      ? PHOTO_TECHNICAL_MARGIN_MM
      : positiveMm(options.technicalMarginMm, 'technicalMarginMm');
  const bleedMm =
    options.bleedMm == null ? PHOTO_BLEED_MM : positiveMm(options.bleedMm, 'bleedMm');
  const allowRotation = options.allowRotation !== false;

  const sheetVariants = [
    {
      sheetWidthMm: SRA3_WIDTH_MM,
      sheetHeightMm: SRA3_HEIGHT_MM,
      sheetOrientation: 'portrait' as const,
    },
    {
      sheetWidthMm: SRA3_HEIGHT_MM,
      sheetHeightMm: SRA3_WIDTH_MM,
      sheetOrientation: 'landscape' as const,
    },
  ];
  const trimVariants = [
    { widthMm: trimWidthMm, heightMm: trimHeightMm },
    ...(allowRotation && Math.abs(trimWidthMm - trimHeightMm) > EPSILON_MM
      ? [{ widthMm: trimHeightMm, heightMm: trimWidthMm }]
      : []),
  ];

  const candidates: PhotoSra3GridConfig[] = [];
  for (const sheet of sheetVariants) {
    for (const trim of trimVariants) {
      const candidate = buildCandidate({
        ...sheet,
        trimWidthMm: trim.widthMm,
        trimHeightMm: trim.heightMm,
        sourceWidthMm: trimWidthMm,
        sourceHeightMm: trimHeightMm,
        technicalMarginMm,
        bleedMm,
      });
      if (candidate) candidates.push(candidate);
    }
  }
  candidates.sort(compareGridCandidates);
  const best = candidates[0];
  if (!best) {
    throw new Error(
      `Формат ${trimWidthMm}×${trimHeightMm} мм с bleed ${bleedMm} мм больше листа SRA3`
    );
  }
  return best;
}

function itemIsRotatedForGrid(
  item: PhotoLayoutItem,
  config: PhotoSra3GridConfig
): boolean {
  const direct =
    Math.abs(item.widthMm - config.trimWidthMm) <= EPSILON_MM &&
    Math.abs(item.heightMm - config.trimHeightMm) <= EPSILON_MM;
  if (direct) return false;
  const swapped =
    Math.abs(item.heightMm - config.trimWidthMm) <= EPSILON_MM &&
    Math.abs(item.widthMm - config.trimHeightMm) <= EPSILON_MM;
  if (swapped) return true;
  throw new Error(
    `В одну SRA3-сетку переданы разные форматы: ${item.widthMm}×${item.heightMm} и ` +
      `${config.trimWidthMm}×${config.trimHeightMm} мм`
  );
}

export function layoutPhotoItemsOnSra3Grid<T extends PhotoLayoutItem>(
  items: T[],
  options: Omit<ChoosePhotoSra3GridOptions, 'trimWidthMm' | 'trimHeightMm'> & {
    trimWidthMm?: number;
    trimHeightMm?: number;
    fillBlankSlots?: boolean;
  } = {}
): PhotoSra3GridPage<T>[] {
  if (items.length === 0) return [];
  const sourceWidthMm = options.trimWidthMm ?? items[0].widthMm;
  const sourceHeightMm = options.trimHeightMm ?? items[0].heightMm;
  const allowRotation =
    options.allowRotation ?? items.every((item) => item.allowRotation !== false);
  const config = choosePhotoSra3Grid({
    trimWidthMm: sourceWidthMm,
    trimHeightMm: sourceHeightMm,
    allowRotation,
    technicalMarginMm: options.technicalMarginMm,
    bleedMm: options.bleedMm,
  });
  const fillBlankSlots = options.fillBlankSlots !== false;
  const pages: PhotoSra3GridPage<T>[] = [];

  for (let offset = 0; offset < items.length; offset += config.capacity) {
    const pageItems = items.slice(offset, offset + config.capacity);
    const slotCount = fillBlankSlots ? config.capacity : pageItems.length;
    const placements: PhotoPlacement<T>[] = [];
    for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
      const item = pageItems[slotIndex];
      const col = slotIndex % config.cols;
      const row = Math.floor(slotIndex / config.cols);
      placements.push({
        ...(item ? { item } : { isBlank: true }),
        xMm:
          config.gridBleedXMm +
          config.bleedMm +
          col * config.cellWidthMm,
        yMm:
          config.gridBleedYMm +
          config.bleedMm +
          row * config.cellHeightMm,
        widthMm: config.trimWidthMm,
        heightMm: config.trimHeightMm,
        rotated: item ? itemIsRotatedForGrid(item, config) : config.rotated,
        slotIndex,
      });
    }
    pages.push({ config, placements });
  }
  return pages;
}

export function piecesPerSra3Sheet(options: ChoosePhotoSra3GridOptions): number {
  return choosePhotoSra3Grid(options).capacity;
}
