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
  allow_custom?: boolean;
  allowCustom?: boolean;
  min?: number;
  max?: number;
  step?: number;
};

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
