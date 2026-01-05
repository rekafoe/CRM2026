/**
 * Сервис для работы с материалами продуктов
 */

import { api } from '../../api/client';
import { ProductMaterialLink } from './types';
import { apiRequestSafe } from './utils/apiHelpers';

/**
 * Получить материалы, привязанные к продукту
 */
export async function getProductMaterials(productId: number): Promise<any[]> {
  return apiRequestSafe<any[]>(
    () => api.get(`/products/${productId}/materials`),
    `загрузки материалов продукта ${productId}`,
    []
  );
}

/**
 * Привязать материал к продукту
 */
export async function addProductMaterial(
  productId: number,
  payload: ProductMaterialLink
): Promise<void> {
  try {
    await api.post(`/products/${productId}/materials`, payload);
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 404) {
      // endpoint отсутствует — тихо игнорируем для совместимости
      return;
    }
    throw error;
  }
}

/**
 * Массовое добавление материалов к продукту
 */
export async function bulkAddProductMaterials(
  productId: number,
  materials: Array<{ material_id: number; qty_per_sheet?: number; is_required?: boolean }>
): Promise<{ added: number; materials: number[] }> {
  const response = await api.post(`/products/${productId}/materials/bulk`, { materials });
  return response.data as { added: number; materials: number[] };
}

/**
 * Удалить материал из продукта
 */
export async function removeProductMaterial(
  productId: number,
  materialId: number
): Promise<void> {
  await api.delete(`/products/${productId}/materials/${materialId}`);
}

