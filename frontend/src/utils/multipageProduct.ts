/** Настройки страниц в simplified-шаблоне */
export type SimplifiedPagesLike = {
  options?: number[];
  min?: number;
  max?: number;
  allowCustom?: boolean;
} | null | undefined;

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
