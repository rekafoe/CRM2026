/** Настройки страниц в simplified-шаблоне */
export type SimplifiedPagesLike = {
  options?: number[];
  min?: number;
  max?: number;
  step?: number;
  allowCustom?: boolean;
} | null | undefined;

/** Шаг кратности страниц (шаблон или эвристика «все пресеты кратны 4»). */
export function inferMultipagePagesStep(step?: number, options?: number[]): number {
  if (step != null && Number.isFinite(step) && step > 0) return Math.floor(step);
  const opts = (options ?? []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  if (opts.length > 0 && opts.every((x) => x % 4 === 0)) return 4;
  return 1;
}

const DEFAULT_CUSTOM_PAGES_MAX = 500;
const DEFAULT_CUSTOM_PAGES_MIN = 4;

/** Границы для произвольного ввода страниц в калькуляторе (не сужать до max пресета). */
export function resolveCalculatorPagesBounds(params: {
  pagesConfig?: SimplifiedPagesLike;
  allowedOptions?: number[];
  allowCustom?: boolean;
  isMultipageLike?: boolean;
}): { min?: number; max?: number } {
  const opts = (params.allowedOptions ?? [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  const allowCustom = params.allowCustom !== false;
  const multipage = params.isMultipageLike === true;

  const min =
    params.pagesConfig?.min ??
    (allowCustom
      ? multipage
        ? DEFAULT_CUSTOM_PAGES_MIN
        : opts.length > 0
          ? Math.min(...opts)
          : DEFAULT_CUSTOM_PAGES_MIN
      : opts.length > 0
        ? Math.min(...opts)
        : multipage
          ? DEFAULT_CUSTOM_PAGES_MIN
          : undefined);

  const max =
    params.pagesConfig?.max ??
    (allowCustom
      ? DEFAULT_CUSTOM_PAGES_MAX
      : opts.length > 0
        ? Math.max(...opts)
        : multipage
          ? DEFAULT_CUSTOM_PAGES_MAX
          : undefined);

  return { min, max };
}

/** Округление вверх до кратности step с учётом min/max. */
export function ceilPagesToStep(
  pages: number,
  step: number,
  bounds?: { min?: number; max?: number },
): { billingPages: number; adjusted: boolean; cappedByMax: boolean } {
  let p = Math.max(1, Math.floor(Number(pages)) || 1);
  const min = bounds?.min;
  const max = bounds?.max;
  if (min != null && Number.isFinite(min)) p = Math.max(min, p);
  const beforeStep = p;
  if (step > 1 && p % step !== 0) {
    p = Math.ceil(p / step) * step;
  }
  let cappedByMax = false;
  if (max != null && Number.isFinite(max) && p > max) {
    p = max;
    cappedByMax = true;
  }
  return {
    billingPages: p,
    adjusted: p !== beforeStep || cappedByMax,
    cappedByMax,
  };
}

export type MultipageCoverMode = 'none' | 'self' | 'separate';

export function resolveCoverPageCount(structure?: { cover?: { mode?: string; page_count?: number } } | null): number {
  if (!structure?.cover || structure.cover.mode === 'none') return 0;
  const raw = structure.cover.page_count;
  if (raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0) return Math.floor(Number(raw));
  return 4;
}

export function resolveMultipagePageSplit(params: {
  pagesCount: number;
  multiPageStructure?: { cover?: { mode?: string; page_count?: number } } | null;
  pagesFromParameter?: boolean;
}) {
  const innerOnly = Math.max(1, Math.floor(Number(params.pagesCount)) || 1);
  const coverMode = (params.multiPageStructure?.cover?.mode ?? 'none') as MultipageCoverMode;
  if (coverMode === 'none') {
    return { totalPages: innerOnly, coverPages: 0, innerPages: innerOnly, coverMode };
  }
  const coverPages = resolveCoverPageCount(params.multiPageStructure);
  if (params.pagesFromParameter === false) {
    return { totalPages: innerOnly + coverPages, coverPages, innerPages: innerOnly, coverMode };
  }
  return {
    totalPages: innerOnly,
    coverPages,
    innerPages: Math.max(1, innerOnly - coverPages),
    coverMode,
  };
}

export function resolveBlockPagesForPrint(split: {
  totalPages: number;
  innerPages: number;
  coverMode: MultipageCoverMode;
}): number {
  return split.coverMode === 'separate' ? split.innerPages : split.totalPages;
}

/** Физических печатных листов на одно изделие (с учётом раскладки и duplex). */
export function computeMultipageSheetsPerItem(
  pages: number,
  itemsPerSheet: number,
  duplex: boolean,
): number {
  const p = Math.max(1, Math.floor(Number(pages)) || 1);
  const perSide = Math.max(1, Math.floor(Number(itemsPerSheet)) || 1);
  const pagesPerPhysicalSheet = perSide * (duplex ? 2 : 1);
  return Math.max(1, Math.ceil(p / pagesPerPhysicalSheet));
}

/** Продукт с расчётом по страницам (альбомы, брошюры), а не «N шт на лист». */
export function isMultipageLikeProduct(params: {
  productType?: string | null;
  simplifiedPages?: SimplifiedPagesLike;
  multiPageStructure?: unknown | null;
  schemaFields?: Array<{ name?: string }> | null;
}): boolean {
  if (params.productType === 'multi_page') return true;
  if (params.multiPageStructure) return true;
  const p = params.simplifiedPages;
  if (p) {
    if (Array.isArray(p.options) && p.options.length > 0) return true;
    if (p.min != null || p.max != null) return true;
  }
  if (params.schemaFields?.some((f) => f.name === 'pages')) return true;
  return false;
}

export function resolveMultipageMinQty(
  size: {
    min_qty?: number;
    items_per_sheet_override?: number;
    print_prices?: Array<{ tiers?: Array<{ min_qty?: number }> }>;
  } | null | undefined,
  options?: { itemsPerSheet?: number; multipageLike?: boolean },
): number {
  if (!size) return 1;
  const multipageLike = options?.multipageLike !== false;
  const minFromTiers = size.print_prices?.[0]?.tiers?.[0]?.min_qty;
  const minFromSize = size.min_qty;
  const overrideN = size.items_per_sheet_override;
  const itemsPerSheet = options?.itemsPerSheet;

  const coupledToOverride =
    minFromSize != null &&
    overrideN != null &&
    Number(minFromSize) === Number(overrideN);
  const coupledToLayout =
    multipageLike &&
    minFromSize != null &&
    itemsPerSheet != null &&
    itemsPerSheet > 1 &&
    Number(minFromSize) === Number(itemsPerSheet);

  if (multipageLike) {
    if (coupledToOverride || coupledToLayout) {
      return minFromTiers ?? 1;
    }
    // min_qty=2 от старой синхронизации с раскладкой, пока нет ответа API с itemsPerSheet
    if (
      minFromSize != null &&
      minFromSize > 1 &&
      overrideN == null &&
      itemsPerSheet == null &&
      (minFromTiers == null || minFromTiers <= 1)
    ) {
      return 1;
    }
    return minFromSize ?? minFromTiers ?? 1;
  }
  return minFromSize ?? minFromTiers ?? 1;
}
