/**
 * Утилиты для работы с API продуктов
 */

import { api } from '../../../api/client';

export interface ApiError {
  message: string;
  status?: number;
  data?: any;
}

/**
 * Безопасное извлечение данных из ответа API
 */
export function extractData<T>(response: any, fallback: T): T {
  return (response?.data as any)?.data || response?.data || fallback;
}

/**
 * Обработка ошибок API с типизацией
 */
export function handleApiError(error: any, context: string): ApiError {
  const apiError: ApiError = {
    message: error?.response?.data?.message || error?.message || `Ошибка ${context}`,
    status: error?.response?.status,
    data: error?.response?.data
  };
  
  console.error(`[ProductService] ${context}:`, apiError.message, error);
  return apiError;
}

/**
 * Обертка для API запросов с обработкой ошибок
 */
export async function apiRequest<T>(
  request: () => Promise<any>,
  context: string,
  fallback: T
): Promise<T> {
  try {
    const response = await request();
    return extractData(response, fallback);
  } catch (error: any) {
    handleApiError(error, context);
    throw error;
  }
}

/**
 * Обертка для API запросов, которые могут вернуть пустой результат
 */
export async function apiRequestSafe<T>(
  request: () => Promise<any>,
  context: string,
  fallback: T = [] as T
): Promise<T> {
  try {
    const response = await request();
    return extractData(response, fallback);
  } catch (error: any) {
    handleApiError(error, context);
    return fallback;
  }
}

