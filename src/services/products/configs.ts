/**
 * Сервис для работы с конфигурациями продуктов
 */

import { api } from '../../api/client';
import { ProductConfig, ProductParameter, ProductParameterPreset } from './types';
import { KeyedCache } from './utils/cache';
import { apiRequestSafe, extractData } from './utils/apiHelpers';

const configsCache = new KeyedCache<ProductConfig[]>(5 * 60 * 1000);

/**
 * Получить конфигурации продукта
 */
export async function getProductConfigs(productId: number): Promise<ProductConfig[]> {
  const cacheKey = `product_${productId}`;
  
  const cached = configsCache.get(cacheKey);
  if (cached) return cached;

  const configs = await apiRequestSafe<ProductConfig[]>(
    () => api.get(`/products/${productId}/configs`),
    `загрузки конфигураций продукта ${productId}`,
    []
  );

  configsCache.set(cacheKey, configs);
  return configs;
}

/**
 * Создать конфигурацию продукта
 */
export async function createProductConfig(
  productId: number,
  configData: { name: string; description?: string; config_data: Record<string, any> }
): Promise<ProductConfig> {
  const response = await api.post(`/products/${productId}/configs`, configData);
  configsCache.clear(`product_${productId}`);
  return extractData(response, null as any);
}

/**
 * Обновить конфигурацию продукта
 */
export async function updateProductConfig(
  productId: number,
  configId: number,
  data: Partial<ProductConfig>
): Promise<ProductConfig> {
  const response = await api.put(`/products/${productId}/configs/${configId}`, data);
  configsCache.clear(`product_${productId}`);
  return extractData(response, null as any);
}

/**
 * Получить пресеты параметров продуктов
 */
export async function getProductParameterPresets(params: {
  productType?: string;
  product_type?: string;
  product_id?: number;
  productName?: string;
}): Promise<ProductParameterPreset[]> {
  // Определяем productType (поддержка обоих вариантов для обратной совместимости)
  const productType = params.productType || params.product_type;
  
  // Если productType не передан или пустой - возвращаем пустой массив
  // Это предотвращает 400 ошибку на бэкенде
  if (!productType || productType.trim() === '') {
    return [];
  }
  
  // Поддержка обоих вариантов для обратной совместимости
  const queryParams: Record<string, any> = {
    productType: productType.trim()
  };
  
  if (params.product_id) {
    queryParams.product_id = params.product_id;
  }
  
  if (params.productName) {
    queryParams.productName = params.productName;
  }

  try {
    // Передаем параметры напрямую в query string
    const response = await api.get('/products/parameter-presets', queryParams);
    const data = (response.data as any) || [];

    return (Array.isArray(data) ? data : []).map((preset: any) => ({
      id: Number(preset.id),
      product_type: preset.product_type || productType,
      product_name: preset.product_name ?? params.productName ?? null,
      preset_key: preset.preset_key || preset.key || '',
      label: preset.label || preset.preset_key || '',
      field_type: (preset.field_type || 'select') as ProductParameterPreset['field_type'],
      options: Array.isArray(preset.options)
        ? preset.options.map(String)
        : typeof preset.options === 'string'
          ? preset.options.split(/[;,]/).map((item: string) => item.trim()).filter(Boolean)
          : undefined,
      help_text: preset.help_text ?? null,
      default_value: preset.default_value ?? null,
      is_required: Boolean(preset.is_required),
      sort_order: Number(preset.sort_order ?? 0),
    }));
  } catch (error: any) {
    // Если получили 400 ошибку - возвращаем пустой массив вместо выбрасывания ошибки
    if (error?.response?.status === 400) {
      console.warn('⚠️ Не удалось загрузить пресеты параметров: productType не указан или неверен', { productType, params });
      return [];
    }
    // Для других ошибок пробрасываем дальше
    throw error;
  }
}

/**
 * Создать параметр продукта
 */
export async function createProductParameter(
  productId: number,
  parameterData: {
    name: string;
    type: string;
    label: string;
    options?: string[] | string; // Может быть массив или строка (JSON)
    min_value?: number;
    max_value?: number;
    step?: number;
    default_value?: string;
    is_required: boolean;
    sort_order: number;
  }
): Promise<ProductParameter> {
  // Преобразуем options в строку, если это массив (как в бэкенде строка 755-759)
  const processedData = {
    ...parameterData,
    options: Array.isArray(parameterData.options)
      ? JSON.stringify(parameterData.options)
      : parameterData.options
  };
  const response = await api.post(`/products/${productId}/parameters`, processedData);
  return extractData(response, null as any);
}

/**
 * Обновить параметр продукта
 */
export async function updateProductParameter(
  productId: number,
  parameterId: number,
  data: Partial<ProductParameter>
): Promise<ProductParameter> {
  // Преобразуем options в строку, если это массив (как в бэкенде строка 755-759)
  // Бэкенд ожидает все поля, поэтому передаем их все (undefined значения не включаем)
  const processedData: Record<string, unknown> = {};
  
  // Обрабатываем каждое поле
  if (data.name !== undefined) processedData.name = data.name;
  if (data.type !== undefined) processedData.type = data.type;
  if (data.label !== undefined) processedData.label = data.label;
  if (data.options !== undefined) {
    processedData.options = Array.isArray(data.options)
      ? JSON.stringify(data.options)
      : data.options;
  }
  if (data.min_value !== undefined) processedData.min_value = data.min_value;
  if (data.max_value !== undefined) processedData.max_value = data.max_value;
  if (data.step !== undefined) processedData.step = data.step;
  if (data.default_value !== undefined) processedData.default_value = data.default_value;
  if (data.is_required !== undefined) processedData.is_required = data.is_required;
  if (data.sort_order !== undefined) processedData.sort_order = data.sort_order;
  
  const response = await api.put(`/products/${productId}/parameters/${parameterId}`, processedData);
  return extractData(response, null as any);
}

/**
 * Удалить параметр продукта
 */
export async function deleteProductParameter(
  productId: number,
  parameterId: number
): Promise<void> {
  await api.delete(`/products/${productId}/parameters/${parameterId}`);
}

