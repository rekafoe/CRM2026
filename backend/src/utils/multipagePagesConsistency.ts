export type MultipagePagesConsistencyResult = {
  ok: boolean;
  expectedPages: number | null;
  actualPages: number | null;
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Число страниц из params позиции (калькулятор / сайт). */
export function readOrderItemPagesParam(params: unknown): number | null {
  if (!isRecord(params)) return null;
  const specs = isRecord(params.specifications) ? params.specifications : null;
  const raw = specs?.pages ?? params.pages;
  const pages = Number(raw);
  if (!Number.isFinite(pages) || pages < 1) return null;
  return Math.floor(pages);
}

/** Фактическое число страниц макета в designState. */
export function readDesignStatePageCount(designState: unknown): number | null {
  if (!isRecord(designState)) return null;
  const explicit = Number(designState.pageCount);
  if (Number.isFinite(explicit) && explicit >= 1) return Math.floor(explicit);
  const pages = Array.isArray(designState.pages) ? designState.pages : [];
  if (pages.length > 0) return pages.length;
  return null;
}

export function readEditorDraftMode(params: unknown): string | null {
  if (!isRecord(params)) return null;
  const mode = params.editorDraftMode;
  return typeof mode === 'string' && mode.trim() ? mode.trim() : null;
}

export type AssertMultipagePagesOptions = {
  /** Блокировать операцию при расхождении (finalize, calculate). */
  strict?: boolean;
  editorDraftMode?: string | null;
  orderPages?: number | null;
  designState?: unknown;
};

/**
 * Сверка числа страниц заказа и макета для multipage-редактора.
 * Без orderPages — только предупреждение не выдаётся (legacy-позиции).
 */
export function assertMultipagePagesConsistency(
  options: AssertMultipagePagesOptions,
): MultipagePagesConsistencyResult {
  const mode = options.editorDraftMode ?? null;
  if (mode !== 'multipage') {
    return { ok: true, expectedPages: null, actualPages: null };
  }

  const expectedPages = options.orderPages ?? null;
  const actualPages = readDesignStatePageCount(options.designState);

  if (expectedPages == null || actualPages == null) {
    return { ok: true, expectedPages, actualPages };
  }

  if (expectedPages === actualPages) {
    return { ok: true, expectedPages, actualPages };
  }

  const message =
    `Число страниц в заказе (${expectedPages}) не совпадает с макетом (${actualPages}). ` +
    'Измените количество страниц в калькуляторе или в редакторе.';

  if (options.strict) {
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = 400;
    err.code = 'MULTIPAGE_PAGES_MISMATCH';
    throw err;
  }

  return { ok: false, expectedPages, actualPages, message };
}

export type SimplifiedPagesConfigLike = {
  options?: number[];
  default?: number;
  allow_custom?: boolean;
  allowCustom?: boolean;
  min?: number;
  max?: number;
  step?: number;
};

/** Эффективный blocks pages: подтип поверх корня (как getEffectiveSimplifiedConfig на фронте). */
export function resolveEffectiveSimplifiedPages(
  rootPages: SimplifiedPagesConfigLike | undefined | null,
  typePages: SimplifiedPagesConfigLike | undefined | null,
): SimplifiedPagesConfigLike | undefined {
  if (!rootPages && !typePages) return undefined;
  return { ...(rootPages ?? {}), ...(typePages ?? {}) };
}

const DEFAULT_MULTI_PAGE_MIN = 4;
const DEFAULT_MULTI_PAGE_MAX = 500;

function resolvePagesBounds(
  pagesConfig: SimplifiedPagesConfigLike | undefined | null,
  opts: number[],
): { min: number; max: number; step?: number } {
  const inferredMin =
    pagesConfig?.min ??
    (opts.length > 0 ? Math.min(...opts) : DEFAULT_MULTI_PAGE_MIN);
  const inferredMax =
    pagesConfig?.max ??
    (opts.length > 0 ? Math.max(...opts) : DEFAULT_MULTI_PAGE_MAX);
  return {
    min: inferredMin,
    max: inferredMax,
    step: pagesConfig?.step,
  };
}

function assertPagesWithinBounds(
  pages: number,
  bounds: { min: number; max: number; step?: number },
): void {
  const p = Math.floor(pages);
  if (p < bounds.min) {
    const err = new Error(`Не менее ${bounds.min} стр.`) as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  if (p > bounds.max) {
    const err = new Error(`Не более ${bounds.max} стр.`) as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  const step = bounds.step;
  if (step != null && step > 0 && p % step !== 0) {
    const err = new Error(`Количество страниц должно быть кратно ${step}`) as Error & {
      status?: number;
    };
    err.status = 400;
    throw err;
  }
}

/** Проверка pages по шаблону simplified.pages (как в калькуляторе CRM). */
export function validateMultiPageCountForTemplate(
  pages: number,
  pagesConfig: SimplifiedPagesConfigLike | undefined | null,
  options?: { isMultiPage?: boolean },
): void {
  const p = Math.floor(pages);
  if (!Number.isFinite(p) || p < 1) {
    const err = new Error('Укажите количество страниц') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const opts = (pagesConfig?.options ?? [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (options?.isMultiPage) {
    if (opts.includes(p)) return;
    const bounds = resolvePagesBounds(pagesConfig, opts);
    assertPagesWithinBounds(p, bounds);
    return;
  }

  if (opts.length === 0) return;

  if (opts.includes(p)) return;

  const allowCustom =
    pagesConfig?.allow_custom === true || pagesConfig?.allowCustom === true;
  if (!allowCustom) {
    const err = new Error('Выберите количество страниц из списка вариантов продукта') as Error & {
      status?: number;
    };
    err.status = 400;
    throw err;
  }

  assertPagesWithinBounds(p, resolvePagesBounds(pagesConfig, opts));
}

export type BindingPagesLimitParams = {
  min_pages?: number;
  max_pages?: number;
  minPages?: number;
  maxPages?: number;
};

export function readBindingPagesLimits(
  parameters: unknown,
): { minPages: number | null; maxPages: number | null } {
  if (!isRecord(parameters)) return { minPages: null, maxPages: null };
  const minRaw = parameters.min_pages ?? parameters.minPages;
  const maxRaw = parameters.max_pages ?? parameters.maxPages;
  const minPages =
    minRaw != null && Number.isFinite(Number(minRaw)) && Number(minRaw) > 0
      ? Math.floor(Number(minRaw))
      : null;
  const maxPages =
    maxRaw != null && Number.isFinite(Number(maxRaw)) && Number(maxRaw) > 0
      ? Math.floor(Number(maxRaw))
      : null;
  return { minPages, maxPages };
}

/** Лимиты страниц для варианта переплёта (bind). */
export function validateBindingPagesLimit(
  pages: number,
  parameters: unknown,
  bindingLabel?: string,
): void {
  const { minPages, maxPages } = readBindingPagesLimits(parameters);
  if (minPages == null && maxPages == null) return;

  const p = Math.floor(pages);
  if (!Number.isFinite(p) || p < 1) return;

  const label = bindingLabel?.trim() ? ` «${bindingLabel.trim()}»` : '';

  if (minPages != null && p < minPages) {
    const err = new Error(
      maxPages != null
        ? `Для переплёта${label} допустимо от ${minPages} до ${maxPages} страниц`
        : `Для переплёта${label} не менее ${minPages} страниц`,
    ) as Error & { status?: number; code?: string };
    err.status = 400;
    err.code = 'BINDING_PAGES_LIMIT';
    throw err;
  }
  if (maxPages != null && p > maxPages) {
    const err = new Error(
      minPages != null
        ? `Для переплёта${label} допустимо от ${minPages} до ${maxPages} страниц`
        : `Для переплёта${label} не более ${maxPages} страниц`,
    ) as Error & { status?: number; code?: string };
    err.status = 400;
    err.code = 'BINDING_PAGES_LIMIT';
    throw err;
  }
}

export type MultipageCoverMode = 'none' | 'self' | 'separate';

/** Перед и зад: два картона на пружине, два листа бумаги при кашировке. */
export const TWO_PIECE_COVER_PAGES = 2;
export const SHEET_BLOCK_DEFAULT_SHEETS = 50;
export const SHEET_BLOCK_MAX_SHEETS = 500;
/**
 * Блокнот листами: рассчитанная сумма — срочная цена.
 * Несрочная — тип «Стандартная», скидка. У карандаша срочная ровно вдвое.
 */
export const SHEET_BLOCK_URGENT_MULTIPLIER = 1;
export const SHEET_BLOCK_STANDARD_MULTIPLIER = 0.5;

function structureRecord(multiPageStructure: unknown): Record<string, unknown> | null {
  return isRecord(multiPageStructure) ? multiPageStructure : null;
}

function isReadyLidStructure(structure: Record<string, unknown> | null): boolean {
  return structure?.coverChoice === 'ready';
}

/**
 * Множитель типа цены для блока листами.
 * Свой множитель продукта перекрывает умолчание. Для остальных типов цен — undefined, берётся справочник.
 */
export function sheetBlockPriceTypeMultiplier(
  priceTypeKey: string,
  productMultipliers?: Record<string, number> | null,
): number | undefined {
  const key = String(priceTypeKey || '').trim().toLowerCase();
  const custom = productMultipliers?.[key];
  if (custom != null && Number.isFinite(Number(custom))) return Number(custom);
  if (key === 'urgent') return SHEET_BLOCK_URGENT_MULTIPLIER;
  if (key === 'standard') return SHEET_BLOCK_STANDARD_MULTIPLIER;
  return undefined;
}

/** Шаблон считает блок листами: оператор вводит листы, страницы выводит расчёт. */
export function usesSheetBlock(multiPageStructure: unknown): boolean {
  const structure = structureRecord(multiPageStructure);
  if (!structure || isReadyLidStructure(structure)) return false;
  const notebook = structure.notebook;
  return isRecord(notebook) && notebook.use_sheets === true;
}

/**
 * Бумага блока «Чистые / В клетку / В точку» из шаблона.
 * Калькулятор шлёт эти id как material_id; они часто не входят в allowed_material_ids размера.
 */
export function sheetBlockPaperMaterialIds(multiPageStructure: unknown): number[] {
  if (!usesSheetBlock(multiPageStructure)) return [];
  const structure = structureRecord(multiPageStructure);
  const notebook = structure?.notebook;
  if (!isRecord(notebook)) return [];
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const key of ['white_material_id', 'grid_material_id', 'dot_material_id'] as const) {
    const id = Number(notebook[key]);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Allowlist размера ∪ бумаги блокнота — иначе выбор «В клетку» вне размера даёт materialPrice $0. */
export function expandAllowedMaterialsForSheetBlock(
  allowedMaterialIds: number[] | null | undefined,
  multiPageStructure: unknown,
): number[] {
  const base = Array.isArray(allowedMaterialIds)
    ? allowedMaterialIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  const paperIds = sheetBlockPaperMaterialIds(multiPageStructure);
  if (paperIds.length === 0) return base;
  const seen = new Set<number>(base);
  const merged = [...base];
  for (const id of paperIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

/** Бумага обложки кашируется на картон: печатная обложка «Своя бумага и печать» с галочкой. */
export function coverIsWrapped(multiPageStructure: unknown): boolean {
  const structure = structureRecord(multiPageStructure);
  if (!structure || isReadyLidStructure(structure)) return false;
  const cover = structure.cover;
  return isRecord(cover) && cover.mode === 'separate' && cover.wrap === true;
}

export type SheetBlock = {
  sheets: number;
  blockPages: number;
  coverPages: number;
  totalPages: number;
};

/**
 * Листы блока в страницы изделия. Лист печатается с двух сторон.
 * 50 листов и два картона — 102 страницы, оператор это число не набирает.
 */
export function resolveSheetBlock(multiPageStructure: unknown, requestedSheets: unknown): SheetBlock | null {
  if (!usesSheetBlock(multiPageStructure)) return null;
  const structure = structureRecord(multiPageStructure);
  const notebook = isRecord(structure?.notebook) ? structure.notebook : {};
  const requested = Math.floor(Number(requestedSheets));
  const fromTemplate = Math.floor(Number(notebook.sheets));
  const sheets =
    Number.isFinite(requested) && requested > 0
      ? requested
      : Number.isFinite(fromTemplate) && fromTemplate > 0
        ? fromTemplate
        : SHEET_BLOCK_DEFAULT_SHEETS;
  if (sheets > SHEET_BLOCK_MAX_SHEETS) {
    const err = new Error(`Листов блока: от 1 до ${SHEET_BLOCK_MAX_SHEETS}`) as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  const coverPages = resolveCoverPageCount(multiPageStructure);
  const blockPages = sheets * 2;
  return { sheets, blockPages, coverPages, totalPages: blockPages + coverPages };
}

/**
 * Как считать листы обложки.
 * layout — страницы обложки раскладываются на лист, как страницы блока.
 * cards — два картона, раскладка блока, листы считаются на весь тираж.
 * wrap — два листа бумаги под кашировку, по одному на лист, без раскладки блока.
 */
export type CoverSheetRule = 'layout' | 'cards' | 'wrap';

export function resolveCoverSheetRule(multiPageStructure: unknown): CoverSheetRule {
  if (coverIsWrapped(multiPageStructure)) return 'wrap';
  if (usesSheetBlock(multiPageStructure)) return 'cards';
  return 'layout';
}

/** Сколько изделий на печатном листе обложки. При кашировке — одно. */
export function coverLayoutPerSheet(rule: CoverSheetRule, itemsPerSheet: number): number {
  if (rule === 'wrap') return 1;
  return Math.max(1, Math.floor(Number(itemsPerSheet)) || 1);
}

/** Физические листы обложки на весь тираж. */
export function computeCoverSheetsTotal(params: {
  rule: CoverSheetRule;
  quantity: number;
  coverPages: number;
  itemsPerSheet: number;
  sidesMode?: string | null;
}): number {
  const qty = Math.max(1, Math.floor(Number(params.quantity)) || 1);
  if (params.rule === 'wrap') return qty * TWO_PIECE_COVER_PAGES;
  const perSheet = coverLayoutPerSheet(params.rule, params.itemsPerSheet);
  if (params.rule === 'cards') {
    return Math.max(1, Math.ceil((qty * TWO_PIECE_COVER_PAGES) / perSheet));
  }
  const coverPages = Math.max(1, Math.floor(Number(params.coverPages)) || 1);
  return Math.max(1, qty * computeMultipageSheetsPerItem(coverPages, perSheet, params.sidesMode));
}

/** Сколько страниц альбома занимает обложка (входит в общее число страниц в калькуляторе). */
export function resolveCoverPageCount(multiPageStructure: unknown): number {
  if (!multiPageStructure || typeof multiPageStructure !== 'object' || Array.isArray(multiPageStructure)) {
    return 0;
  }
  const cover = (multiPageStructure as Record<string, unknown>).cover as Record<string, unknown> | undefined;
  if (!cover || cover.mode === 'none') return 0;
  if (usesSheetBlock(multiPageStructure) || coverIsWrapped(multiPageStructure)) return TWO_PIECE_COVER_PAGES;
  const raw = cover.page_count ?? cover.pageCount ?? cover.pages;
  if (raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0) {
    return Math.floor(Number(raw));
  }
  return 4;
}

export function resolveMultipageCoverMode(multiPageStructure: unknown): MultipageCoverMode {
  if (!multiPageStructure || typeof multiPageStructure !== 'object' || Array.isArray(multiPageStructure)) {
    return 'none';
  }
  const mode = (multiPageStructure as Record<string, unknown>).cover as Record<string, unknown> | undefined;
  const m = mode?.mode;
  if (m === 'self' || m === 'separate' || m === 'none') return m;
  return 'none';
}

/**
 * Делит число страниц на обложку и блок.
 * В калькуляторе `pages` = всего в альбоме (с обложкой), если не задан фиксированный только блок.
 */
export function resolveMultipagePageSplit(params: {
  pagesCount: number;
  multiPageStructure?: unknown;
  /** false = innerBlock.pagesSource fixed — pagesCount только блок, без вычитания обложки */
  pagesFromParameter: boolean;
}): {
  totalPages: number;
  coverPages: number;
  innerPages: number;
  coverMode: MultipageCoverMode;
} {
  const innerOnly = Math.max(1, Math.floor(Number(params.pagesCount)) || 1);
  const coverMode = resolveMultipageCoverMode(params.multiPageStructure);
  if (coverMode === 'none') {
    return { totalPages: innerOnly, coverPages: 0, innerPages: innerOnly, coverMode };
  }
  const coverPages = resolveCoverPageCount(params.multiPageStructure);
  if (!params.pagesFromParameter) {
    return {
      totalPages: innerOnly + coverPages,
      coverPages,
      innerPages: innerOnly,
      coverMode,
    };
  }
  const totalPages = innerOnly;
  const blockPages = Math.max(1, totalPages - coverPages);
  return { totalPages, coverPages, innerPages: blockPages, coverMode };
}

/** Страниц для расчёта печати/материала блока (без двойного учёта обложки). */
export function resolveBlockPagesForPrint(split: {
  totalPages: number;
  innerPages: number;
  coverMode: MultipageCoverMode;
}): number {
  if (split.coverMode === 'separate') return split.innerPages;
  return split.totalPages;
}

/** В шаблоне задан блок pages (пресеты или min/max) — расчёт по листам блока, не по раскладке. */
export function templateHasPagesPricing(pages: unknown): boolean {
  if (!pages || typeof pages !== 'object' || Array.isArray(pages)) return false;
  const p = pages as Record<string, unknown>;
  const opts = p.options;
  if (Array.isArray(opts) && opts.length > 0) return true;
  if (p.min != null || p.max != null) return true;
  return false;
}

/**
 * Физических печатных листов на одно изделие (блок): страницы / (вместимость на сторону × стороны).
 * Пример: 28 стр., A4 на SRA3 (2 на сторону), duplex → ceil(28/4) = 7 листов.
 */
/** Позиций печати (полей на листе) для биллинга: физические листы × вместимость раскладки. */
export function computeMultipagePrintUnits(
  physicalSheets: number,
  itemsPerSheet: number,
): number {
  const sheets = Math.max(1, Math.floor(Number(physicalSheets)) || 1);
  const perSide = Math.max(1, Math.floor(Number(itemsPerSheet)) || 1);
  return sheets * perSide;
}

/** Позиций печати обложки на весь тираж (для tier вместе с блоком на одном станке). */
export function computeMultipageCoverPrintUnits(params: {
  quantity: number;
  coverPages: number;
  itemsPerSheet: number;
  sidesMode?: string | null;
  rule?: CoverSheetRule;
}): number {
  const rule = params.rule ?? 'layout';
  const coverSheetsTotal = computeCoverSheetsTotal({
    rule,
    quantity: params.quantity,
    coverPages: params.coverPages,
    itemsPerSheet: params.itemsPerSheet,
    sidesMode: params.sidesMode,
  });
  return computeMultipagePrintUnits(coverSheetsTotal, coverLayoutPerSheet(rule, params.itemsPerSheet));
}

export function computeMultipageSheetsPerItem(
  pages: number,
  itemsPerSheet: number,
  sidesMode?: string | null,
): number {
  const p = Math.max(1, Math.floor(Number(pages)) || 1);
  const perSide = Math.max(1, Math.floor(Number(itemsPerSheet)) || 1);
  const duplex = sidesMode === 'duplex' || sidesMode === 'duplex_bw_back';
  const pagesPerPhysicalSheet = perSide * (duplex ? 2 : 1);
  return Math.max(1, Math.ceil(p / pagesPerPhysicalSheet));
}

/** Печать с множителем страниц (тираж × листов на экземпляр), без min тиража по раскладке. */
export function usesMultipageSheetPricing(params: {
  productType?: string | null;
  multiPageStructure?: unknown;
  simplifiedPages?: unknown;
}): boolean {
  if (params.productType === 'multi_page') return true;
  if (params.multiPageStructure) return true;
  return templateHasPagesPricing(params.simplifiedPages);
}
