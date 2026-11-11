import {
  DEFAULT_PRODUCT_LIST_FILTERS,
  filterAndSortProducts,
  isPublishedOnSite,
  nextProductListSort,
  parseProductListFilters,
  productListBackTarget,
  serializeProductListSearch,
  type ProductListRow,
} from '../../frontend/src/utils/productListFilters';

const wideFormat = 7;

const products: ProductListRow[] = [
  {
    name: 'Баннер',
    description: 'Широкоформатная печать',
    is_active: 1,
    active_for_site: 1,
    category_id: wideFormat,
    updated_at: '2026-01-02T00:00:00.000Z',
  },
  {
    name: 'Плёнка',
    description: '',
    is_active: 1,
    active_for_site: 0,
    category_id: wideFormat,
    updated_at: '2026-03-01T00:00:00.000Z',
  },
  {
    name: 'Визитка',
    description: 'Цифра',
    is_active: 0,
    active_for_site: 1,
    category_id: 2,
    updated_at: '2026-02-01T00:00:00.000Z',
  },
];

describe('productListFilters', () => {
  it('читает категорию, поиск, активность, сайт и сортировку', () => {
    const filters = parseProductListFilters('?q=баннер&category=7&active=1&site=on&sort=category&dir=desc&page=2');
    expect(filters).toEqual({
      query: 'баннер',
      showOnlyActive: true,
      selectedCategoryId: 7,
      site: 'on',
      sortField: 'category',
      sortDirection: 'desc',
    });
  });

  it('неизвестные и пустые значения не ломают значения по умолчанию', () => {
    expect(parseProductListFilters('?site=maybe&category=0&sort=price&active=0')).toEqual(
      DEFAULT_PRODUCT_LIST_FILTERS,
    );
  });

  it('сохраняет page и прочие параметры при записи фильтров', () => {
    const current = new URLSearchParams('page=3&tab=list&q=старое');
    const next = serializeProductListSearch(current, {
      ...DEFAULT_PRODUCT_LIST_FILTERS,
      selectedCategoryId: wideFormat,
      site: 'off',
      sortField: 'updated',
      sortDirection: 'desc',
    });
    expect(next.get('page')).toBe('3');
    expect(next.get('tab')).toBe('list');
    expect(next.get('q')).toBeNull();
    expect(next.get('category')).toBe('7');
    expect(next.get('site')).toBe('off');
    expect(next.get('sort')).toBe('updated');
    expect(next.get('dir')).toBe('desc');
    expect(parseProductListFilters(next).selectedCategoryId).toBe(wideFormat);
  });

  it('кнопка назад ведёт на список с тем же query', () => {
    expect(productListBackTarget('?category=7&site=on')).toBe('/adminpanel/products?category=7&site=on');
    expect(productListBackTarget('')).toBe('/adminpanel/products');
  });

  it('переключает направление сортировки и сбрасывает поле', () => {
    const byName = { ...DEFAULT_PRODUCT_LIST_FILTERS, sortField: 'name' as const, sortDirection: 'asc' as const };
    expect(nextProductListSort(byName, 'name')).toEqual({ sortField: 'name', sortDirection: 'desc' });
    expect(nextProductListSort(byName, 'category')).toEqual({ sortField: 'category', sortDirection: 'asc' });
  });

  it('широкоформат и «на сайте» оставляют только опубликованные в категории', () => {
    const visible = filterAndSortProducts(
      products,
      { ...DEFAULT_PRODUCT_LIST_FILTERS, selectedCategoryId: wideFormat, site: 'on' },
      () => '',
    );
    expect(visible.map((item) => item.name)).toEqual(['Баннер']);
  });

  it('«не на сайте» — выключенные и без отметки витрины', () => {
    const hidden = filterAndSortProducts(
      products,
      { ...DEFAULT_PRODUCT_LIST_FILTERS, site: 'off' },
      (id) => (id === wideFormat ? 'ШФП' : 'Полиграфия'),
    );
    expect(hidden.map((item) => item.name)).toEqual(['Визитка', 'Плёнка']);
    expect(isPublishedOnSite(products[0])).toBe(true);
    expect(isPublishedOnSite(products[1])).toBe(false);
    expect(isPublishedOnSite(products[2])).toBe(false);
  });

  it('только активные и поиск работают вместе с сортировкой по категории', () => {
    const rows = filterAndSortProducts(
      products,
      {
        ...DEFAULT_PRODUCT_LIST_FILTERS,
        query: '  ',
        showOnlyActive: true,
        sortField: 'category',
        sortDirection: 'asc',
      },
      (id) => (id === wideFormat ? 'ШФП' : 'Полиграфия'),
    );
    expect(rows.map((item) => item.name)).toEqual(['Баннер', 'Плёнка']);
  });
});
