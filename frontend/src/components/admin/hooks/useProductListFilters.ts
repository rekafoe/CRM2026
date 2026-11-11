import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  nextProductListSort,
  parseProductListFilters,
  serializeProductListSearch,
  type ProductListFilters,
  type ProductListSortField,
} from '../../../utils/productListFilters';

/**
 * Фильтры списка продуктов — источник правды в query.
 * replace: смена фильтра не плодит шаги истории, «назад» со страницы продукта
 * возвращает последний набор, а не промежуточный ввод.
 */
export function useProductListFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseProductListFilters(searchParams), [searchParams]);

  const replaceFilters = useCallback((next: ProductListFilters) => {
    setSearchParams((prev) => serializeProductListSearch(prev, next), { replace: true });
  }, [setSearchParams]);

  const updateFilters = useCallback((patch: Partial<ProductListFilters>) => {
    const current = parseProductListFilters(searchParams);
    replaceFilters({ ...current, ...patch });
  }, [replaceFilters, searchParams]);

  const toggleSort = useCallback((field: ProductListSortField) => {
    const current = parseProductListFilters(searchParams);
    replaceFilters({ ...current, ...nextProductListSort(current, field) });
  }, [replaceFilters, searchParams]);

  return { filters, updateFilters, toggleSort };
}
