/**
 * Сервис для работы с продуктами
 */

import { api } from '../../api/client';
import { Product, ProductWithDetails } from './types';
import { KeyedCache, SimpleCache } from './utils/cache';
import { apiRequest, apiRequestSafe, extractData } from './utils/apiHelpers';

const productsByCategoryCache = new KeyedCache<Product[]>(5 * 60 * 1000);
const allProductsCache = new KeyedCache<Product[]>(5 * 60 * 1000); // ✅ Используем KeyedCache для поддержки activeOnly
const productDetailsCache = new KeyedCache<ProductWithDetails>(5 * 60 * 1000);

/**
 * Получить продукты по категории
 */
export async function getProductsByCategory(
  categoryId: number,
  force: boolean = false
): Promise<Product[]> {
  const cacheKey = `category_${categoryId}`;

  if (!force) {
    const cached = productsByCategoryCache.get(cacheKey);
    if (cached) return cached;
  }

  const products = await apiRequestSafe<Product[]>(
    () => api.get(`/products/category/${categoryId}`),
    `загрузки продуктов категории ${categoryId}`,
    []
  );

  productsByCategoryCache.set(cacheKey, products);
  return products;
}

/**
 * Получить все продукты
 * @param force - принудительно обновить кэш
 * @param activeOnly - показывать только активные продукты (для калькулятора/заказов)
 */
export async function getAllProducts(force: boolean = false, activeOnly: boolean = false): Promise<Product[]> {
  const cacheKey = activeOnly ? 'active' : 'all';
  
  if (!force) {
    const cached = allProductsCache.get(cacheKey);
    if (cached) return cached;
  }

  const products = await apiRequestSafe<Product[]>(
    () => api.get('/products', { params: activeOnly ? { activeOnly: 'true' } : {} }),
    'загрузки всех продуктов',
    []
  );

  allProductsCache.set(cacheKey, products);
  return products;
}

/**
 * Получить детали продукта
 */
export async function getProductDetails(productId: number): Promise<ProductWithDetails | null> {
  const cacheKey = `product_${productId}`;

  const cached = productDetailsCache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await api.get(`/products/${productId}`);
    const product = extractData<ProductWithDetails | null>(response, null);
    
    if (product) {
      productDetailsCache.set(cacheKey, product);
    }
    
    return product;
  } catch (error: any) {
    console.error(`Ошибка загрузки деталей продукта ${productId}:`, error);
    return null;
  }
}

/**
 * Обновить продукт
 */
export async function updateProduct(
  productId: number,
  data: Partial<Product>
): Promise<{ updated: number }> {
  const response = await api.put(`/products/${productId}`, data);
  
  // Инвалидируем кэши
  productDetailsCache.clear(`product_${productId}`);
  productsByCategoryCache.clear();
  allProductsCache.clear();
  
  return extractData(response, { updated: 0 });
}

/**
 * Создать продукт
 */
export async function createProduct(productData: {
  category_id?: number;
  name: string;
  description?: string;
  icon?: string;
  calculator_type?: 'product' | 'operation' | 'simplified';
  product_type?: 'sheet_single' | 'multi_page' | 'universal' | 'sheet_item' | 'multi_page_item';
  operator_percent?: number;
}): Promise<{ id: number; name: string }> {
  const response = await api.post('/products', productData);
  
  // Инвалидируем кэши
  productsByCategoryCache.clear();
  allProductsCache.clear(); // Очищаем все ключи (all и active)
  
  return extractData(response, { id: 0, name: '' });
}

/**
 * Удалить продукт
 */
export async function deleteProduct(productId: number): Promise<void> {
  await api.delete(`/products/${productId}`);
  
  // Инвалидируем кэши
  productDetailsCache.clear(`product_${productId}`);
  productsByCategoryCache.clear();
  allProductsCache.clear();
}

/**
 * Поиск продуктов (только активные для калькулятора/заказов)
 */
export async function searchProducts(query: string, activeOnly: boolean = true): Promise<Product[]> {
  return apiRequestSafe<Product[]>(
    () => api.get('/products', { params: { search: query, ...(activeOnly ? { activeOnly: 'true' } : {}) } }),
    `поиска продуктов "${query}"`,
    []
  );
}

/**
 * Получить продукты для калькулятора
 */
export async function getProductsForCalculator(): Promise<Product[]> {
  return apiRequestSafe<Product[]>(
    () => api.get('/products', { params: { activeOnly: 'true' } }),
    'загрузки продуктов для калькулятора',
    []
  );
}

/**
 * Создать продукт с полной настройкой
 */
export async function createProductWithSetup(payload: {
  product: {
    category_id?: number;
    name: string;
    description?: string;
    icon?: string;
    calculator_type?: 'product' | 'operation' | 'simplified';
    product_type?: 'sheet_single' | 'multi_page' | 'universal' | 'sheet_item' | 'multi_page_item';
  };
  operations?: Array<{
    operation_id: number;
    sequence?: number;
    is_required?: boolean;
    is_default?: boolean;
    price_multiplier?: number;
  }>;
  materials?: Array<{ material_id: number }>;
  parameters?: Array<{
    name: string;
    type: string;
    label: string;
    options?: string[];
    min_value?: number;
    max_value?: number;
    step?: number;
    default_value?: string;
    is_required: boolean;
    sort_order: number;
  }>;
  template?: Record<string, any>;
  autoOperationType?: string;
}): Promise<{ id: number; name: string }> {
  const response = await api.post('/products/setup', payload);
  
  // Инвалидируем кэши
  productsByCategoryCache.clear();
  allProductsCache.clear(); // Очищаем все ключи (all и active)
  
  return extractData(response, { id: 0, name: '' });
}

/**
 * Очистить все кэши продуктов
 */
export function clearProductsCache(): void {
  productsByCategoryCache.clear();
  allProductsCache.clear();
  productDetailsCache.clear();
}

