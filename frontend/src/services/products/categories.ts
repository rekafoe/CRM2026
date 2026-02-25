/**
 * Сервис для работы с категориями продуктов
 */

import { api, apiClient } from '../../api/client';
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
  image_url?: string;
  description?: string;
  sort_order?: number;
}): Promise<{ id: number; name: string }> {
  const response = await api.post('/products/categories', categoryData);
  categoriesCache.clear(); // Инвалидируем кэш
  return (response.data as any)?.data || response.data;
}

/**
 * Обновить категорию продукта
 */
export async function updateProductCategory(
  id: number,
  data: {
    name: string;
    icon?: string;
    image_url?: string;
    description?: string;
    sort_order?: number;
    is_active?: boolean;
  }
): Promise<void> {
  await api.put(`/products/categories/${id}`, data);
  categoriesCache.clear();
}

/**
 * Загрузить изображение для категории
 */
export async function uploadCategoryImage(file: File): Promise<{ image_url: string; filename: string; size: number }> {
  const formData = new FormData();
  formData.append('image', file);
  const response = await apiClient.post('/products/categories/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return (response.data as any)?.data || response.data;
}

/**
 * Очистить кэш категорий
 */
export function clearCategoriesCache(): void {
  categoriesCache.clear();
}

