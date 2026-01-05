import React from 'react';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ApiResponse, ApiError, PaginatedResponse } from '../types';

// Создание экземпляра axios с базовой конфигурацией
export const createApiClient = (baseURL: string = '/api'): AxiosInstance => {
  const client = axios.create({
    baseURL,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Интерцептор для добавления токена авторизации
  client.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('crmToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Интерцептор для обработки ответов
  client.interceptors.response.use(
    (response: AxiosResponse) => {
      return response;
    },
    (error) => {
      const apiError: ApiError = {
        message: error.response?.data?.message || error.message || 'Произошла ошибка',
        code: error.response?.status?.toString() || 'UNKNOWN',
        details: error.response?.data?.details,
        timestamp: new Date().toISOString(),
      };

      // Обработка специфичных ошибок
      if (error.response?.status === 401) {
        // Неавторизован - перенаправляем на страницу входа
        localStorage.removeItem('crmToken');
        window.location.href = '/login';
      }

      return Promise.reject(apiError);
    }
  );

  return client;
};

// Базовый API клиент
export const apiClient = createApiClient('');

// Утилиты для работы с API
export const apiUtils = {
  // Обработка успешного ответа
  handleSuccess: <T>(response: AxiosResponse<T>): ApiResponse<T> => ({
    data: response.data,
    success: true,
    message: (response.data as any)?.message,
  }),

  // Обработка ошибки
  handleError: (error: any): ApiResponse<null> => ({
    data: null,
    success: false,
    error: error.message || 'Произошла ошибка',
  }),

  // Создание параметров запроса с пагинацией
  createPaginatedParams: (page: number = 1, limit: number = 20, filters?: Record<string, any>) => ({
    page,
    limit,
    ...filters,
  }),

  // Создание параметров поиска
  createSearchParams: (query: string, fields: string[] = []) => ({
    q: query,
    fields: fields.join(','),
  }),

  // Создание параметров сортировки
  createSortParams: (field: string, direction: 'asc' | 'desc' = 'asc') => ({
    sort: field,
    order: direction,
  }),

  // Создание параметров фильтрации по дате
  createDateRangeParams: (from?: string, to?: string) => {
    const params: Record<string, string> = {};
    if (from) params.from = from;
    if (to) params.to = to;
    return params;
  },
};

// Типизированные методы для работы с API
export const apiMethods = {
  // GET запрос
  get: async <T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    try {
      const response = await apiClient.get<T>(url, config);
      return apiUtils.handleSuccess(response);
    } catch (error) {
      return apiUtils.handleError(error) as ApiResponse<T>;
    }
  },

  // POST запрос
  post: async <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    try {
      const response = await apiClient.post<T>(url, data, config);
      return apiUtils.handleSuccess(response);
    } catch (error) {
      return apiUtils.handleError(error) as ApiResponse<T>;
    }
  },

  // PUT запрос
  put: async <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    try {
      const response = await apiClient.put<T>(url, data, config);
      return apiUtils.handleSuccess(response);
    } catch (error) {
      return apiUtils.handleError(error) as ApiResponse<T>;
    }
  },

  // PATCH запрос
  patch: async <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    try {
      const response = await apiClient.patch<T>(url, data, config);
      return apiUtils.handleSuccess(response);
    } catch (error) {
      return apiUtils.handleError(error) as ApiResponse<T>;
    }
  },

  // DELETE запрос
  delete: async <T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    try {
      const response = await apiClient.delete<T>(url, config);
      return apiUtils.handleSuccess(response);
    } catch (error) {
      return apiUtils.handleError(error) as ApiResponse<T>;
    }
  },

  // Загрузка файла
  uploadFile: async <T>(
    url: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<T>> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post<T>(url, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(progress);
          }
        },
      });

      return apiUtils.handleSuccess(response);
    } catch (error) {
      return apiUtils.handleError(error) as ApiResponse<T>;
    }
  },

  // Пагинированный запрос
  getPaginated: async <T>(
    url: string,
    page: number = 1,
    limit: number = 20,
    filters?: Record<string, any>
  ): Promise<ApiResponse<PaginatedResponse<T>>> => {
    try {
      const params = apiUtils.createPaginatedParams(page, limit, filters);
      const response = await apiClient.get<PaginatedResponse<T>>(url, { params });
      return apiUtils.handleSuccess(response);
    } catch (error) {
      return apiUtils.handleError(error) as unknown as ApiResponse<PaginatedResponse<T>>;
    }
  },
};

// Хук для работы с API
export const useApi = () => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);

  const execute = async <T>(
    apiCall: () => Promise<ApiResponse<T>>
  ): Promise<ApiResponse<T>> => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiCall();
      if (!result.success) {
        setError(result.error as unknown as ApiError);
      }
      return result;
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError);
      return {
        data: null as unknown as T,
        success: false,
        error: apiError.message,
      };
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => setError(null);

  return {
    loading,
    error,
    execute,
    clearError,
  };
};

// Утилиты для кэширования
export const cacheUtils = {
  // Простое кэширование в памяти
  memoryCache: new Map<string, { data: any; timestamp: number; ttl: number }>(),

  set: (key: string, data: any, ttl: number = 300000) => { // 5 минут по умолчанию
    cacheUtils.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  },

  get: (key: string): any | null => {
    const cached = cacheUtils.memoryCache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      cacheUtils.memoryCache.delete(key);
      return null;
    }

    return cached.data;
  },

  clear: (key?: string) => {
    if (key) {
      cacheUtils.memoryCache.delete(key);
    } else {
      cacheUtils.memoryCache.clear();
    }
  },

  // Кэшированный API запрос
  cachedRequest: async <T>(
    key: string,
    apiCall: () => Promise<ApiResponse<T>>,
    ttl: number = 300000
  ): Promise<ApiResponse<T>> => {
    const cached = cacheUtils.get(key);
    if (cached) {
      return cached;
    }

    const result = await apiCall();
    if (result.success) {
      cacheUtils.set(key, result, ttl);
    }

    return result;
  },
};

// Утилиты для работы с ошибками
export const errorHandlers = {
  // Обработка сетевых ошибок
  handleNetworkError: (error: any): string => {
    if (!navigator.onLine) {
      return 'Нет подключения к интернету';
    }
    if (error.code === 'ECONNABORTED') {
      return 'Превышено время ожидания запроса';
    }
    return 'Ошибка сети';
  },

  // Обработка HTTP ошибок
  handleHttpError: (status: number): string => {
    const errorMessages: Record<number, string> = {
      400: 'Некорректный запрос',
      401: 'Необходима авторизация',
      403: 'Доступ запрещен',
      404: 'Ресурс не найден',
      409: 'Конфликт данных',
      422: 'Ошибка валидации',
      500: 'Внутренняя ошибка сервера',
      502: 'Ошибка шлюза',
      503: 'Сервис недоступен',
    };

    return errorMessages[status] || 'Неизвестная ошибка';
  },

  // Логирование ошибок
  logError: (error: ApiError, context?: string) => {
    console.error(`API Error${context ? ` in ${context}` : ''}:`, {
      message: error.message,
      code: error.code,
      details: error.details,
      timestamp: error.timestamp,
    });
  },
};
