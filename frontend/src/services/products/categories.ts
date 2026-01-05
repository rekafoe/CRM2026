/**
 * Сервис для работы с категориями продуктов
 */

import { api } from '../../api/client';
import { ProductCategory } from './types';
import { SimpleCache } from './utils/cache';
import { apiRequestSafe } from './utils/apiHelpers';

const categoriesCache = new SimpleCache<ProductCategory[]>(5 * 60 * 1000);

/**
 * Получить все категории продуктов
 */
export async function getProductCategories(force: boolean = false): Promise<ProductCategory[]> {
  if (!force) {
    const cached = categoriesCache.get();
    if (cached) return cached;
  }

  const categories = await apiRequestSafe<ProductCategory[]>(
    () => api.get('/products/categories'),
    'загрузки категорий продуктов',
    []
  );

  categoriesCache.set(categories);
  return categories;
}

/**
 * Создать категорию продукта
 */
export async function createProductCategory(categoryData: {
  name: string;
  icon?: string;
  description?: string;
  sort_order?: number;
}): Promise<{ id: number; name: string }> {
  const response = await api.post('/products/categories', categoryData);
  categoriesCache.clear(); // Инвалидируем кэш
  return (response.data as any)?.data || response.data;
}

/**
 * Очистить кэш категорий
 */
export function clearCategoriesCache(): void {
  categoriesCache.clear();
}

