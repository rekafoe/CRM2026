/**
 * Сервис для работы с операциями продуктов
 */

import { api } from '../../api/client';
import { PostProcessingOperation } from './types';
import { apiRequestSafe, extractData } from './utils/apiHelpers';

/**
 * Получить все операции
 */
export async function getAllOperations(params?: {
  operation_type?: string;
  is_active?: boolean;
}): Promise<PostProcessingOperation[]> {
  return apiRequestSafe<PostProcessingOperation[]>(
    () => api.get('/operations', { params }),
    'загрузки операций',
    []
  );
}

/**
 * Массовое добавление операций к продукту
 */
export async function bulkAddProductOperations(
  productId: number,
  operations: Array<{
    operation_id: number;
    sequence?: number;
    is_required?: boolean;
    is_default?: boolean;
    price_multiplier?: number;
    conditions?: any;
    linked_parameter_name?: string;
  }>
): Promise<{ added: number; operations: number[] }> {
  const response = await api.post(`/products/${productId}/operations/bulk`, { operations });
  return response.data as { added: number; operations: number[] };
}

