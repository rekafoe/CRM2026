/**
 * Фильтры списка продуктов админки живут в query списка `/adminpanel/products`.
 * История браузера и кнопка «Назад» (location.state.backTo) возвращают тот же query.
 * Чужие параметры (в том числе page) не трогаем.
 */

export const PRODUCT_LIST_PATH = '/adminpanel/products';

export type ProductListSortField = 'name' | 'category' | 'updated';
export type ProductListSortDirection = 'asc' | 'desc';
export type ProductSiteFilter = 'all' | 'on' | 'off';

export interface ProductListFilters {
  query: string;
  showOnlyActive: boolean;
  selectedCategoryId: number | null;
  site: ProductSiteFilter;
  sortField: ProductListSortField;
  sortDirection: ProductListSortDirection;
}

export const DEFAULT_PRODUCT_LIST_FILTERS: ProductListFilters = {
  query: '',
  showOnlyActive: false,
  selectedCategoryId: null,
  site: 'all',
  sortField: 'name',
  sortDirection: 'asc',
};

const OWNED_QUERY_KEYS = ['q', 'category', 'active', 'site', 'sort', 'dir'] as const;

export interface ProductListRow {
  name: string;
  description?: string | null;
  is_active?: boolean | number | string | null;
  active_for_site?: boolean | number | string | null;
  category_id?: number | null;
  updated_at?: string | null;
}

function asSearchParams(search: string | URLSearchParams): URLSearchParams {
  if (typeof search !== 'string') return search;
  const raw = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(raw);
}

/** Флаг SQLite/API: 1, true или строка "1". */
export function isSqlFlagOn(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

/**
 * Продукт опубликован в каталоге сайта: включён и отмечен active_for_site.
 * Так же решает бэкенд при forSite=1.
 */
export function isPublishedOnSite(product: {
  is_active?: unknown;
  active_for_site?: unknown;
}): boolean {
  return isSqlFlagOn(product.is_active) && isSqlFlagOn(product.active_for_site);
}

export function parseProductListFilters(search: string | URLSearchParams): ProductListFilters {
  const params = asSearchParams(search);
  const categoryRaw = params.get('category');
  let selectedCategoryId: number | null = null;
  if (categoryRaw && /^\d+$/.test(categoryRaw)) {
    const id = Number(categoryRaw);
    if (id > 0) selectedCategoryId = id;
  }

  const siteRaw = params.get('site');
  const site: ProductSiteFilter = siteRaw === 'on' || siteRaw === 'off' ? siteRaw : 'all';

  const sortRaw = params.get('sort');
  const sortField: ProductListSortField =
    sortRaw === 'name' || sortRaw === 'category' || sortRaw === 'updated' ? sortRaw : 'name';

  const active = params.get('active');

  return {
    query: params.get('q') ?? '',
    showOnlyActive: active === '1' || active === 'true',
    selectedCategoryId,
    site,
    sortField,
    sortDirection: params.get('dir') === 'desc' ? 'desc' : 'asc',
  };
}

/** Пишет фильтры в копию query. Параметры вне списка (page и другие) сохраняются. */
export function serializeProductListSearch(
  current: string | URLSearchParams,
  filters: ProductListFilters,
): URLSearchParams {
  const next = new URLSearchParams(asSearchParams(current));
  for (const key of OWNED_QUERY_KEYS) next.delete(key);

  if (filters.query) next.set('q', filters.query);
  if (filters.selectedCategoryId != null && filters.selectedCategoryId > 0) {
    next.set('category', String(filters.selectedCategoryId));
  }
  if (filters.showOnlyActive) next.set('active', '1');
  if (filters.site === 'on' || filters.site === 'off') next.set('site', filters.site);
  if (filters.sortField !== 'name') next.set('sort', filters.sortField);
  if (filters.sortDirection === 'desc') next.set('dir', 'desc');
  return next;
}

export function productListBackTarget(search: string): string {
  if (!search || search === '?') return PRODUCT_LIST_PATH;
  const suffix = search.startsWith('?') ? search : `?${search}`;
  return `${PRODUCT_LIST_PATH}${suffix}`;
}

export function nextProductListSort(
  current: ProductListFilters,
  field: ProductListSortField,
): Pick<ProductListFilters, 'sortField' | 'sortDirection'> {
  if (current.sortField === field) {
    return {
      sortField: field,
      sortDirection: current.sortDirection === 'asc' ? 'desc' : 'asc',
    };
  }
  return { sortField: field, sortDirection: 'asc' };
}

export function filterAndSortProducts<T extends ProductListRow>(
  products: readonly T[],
  filters: ProductListFilters,
  categoryName: (categoryId: number | null | undefined) => string,
): T[] {
  const search = filters.query.trim().toLowerCase();
  const filtered = products.filter((product) => {
    if (search) {
      const name = product.name.toLowerCase();
      const description = (product.description || '').toLowerCase();
      if (!name.includes(search) && !description.includes(search)) return false;
    }
    if (filters.showOnlyActive && !product.is_active) return false;
    if (filters.selectedCategoryId != null && product.category_id !== filters.selectedCategoryId) {
      return false;
    }
    const onSite = isPublishedOnSite(product);
    if (filters.site === 'on' && !onSite) return false;
    if (filters.site === 'off' && onSite) return false;
    return true;
  });

  filtered.sort((a, b) => {
    let comparison = 0;
    if (filters.sortField === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (filters.sortField === 'category') {
      comparison = categoryName(a.category_id).localeCompare(categoryName(b.category_id));
    } else {
      const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      comparison = dateA - dateB;
    }
    return filters.sortDirection === 'asc' ? comparison : -comparison;
  });

  return filtered;
}
