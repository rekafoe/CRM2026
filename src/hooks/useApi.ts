import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ApiResponse, ApiError } from '../types';
import { apiMethods, cacheUtils } from '../utils/api';

// Базовый хук для API запросов
export const useApi = <T>(
  apiCall: () => Promise<ApiResponse<T>>,
  dependencies: any[] = [],
  options: {
    immediate?: boolean;
    cache?: boolean;
    cacheKey?: string;
    cacheTtl?: number;
  } = {}
) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState(false);
  const isMountedRef = useRef(true);

  const {
    immediate = true,
    cache = false,
    cacheKey,
    cacheTtl = 300000,
  } = options;

  const execute = useCallback(async () => {
    if (!isMountedRef.current) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      let result: ApiResponse<T>;

      if (cache && cacheKey) {
        result = await cacheUtils.cachedRequest(cacheKey, apiCall, cacheTtl);
      } else {
        result = await apiCall();
      }

      if (!isMountedRef.current) return;

      if (result.success) {
        setData(result.data);
        setSuccess(true);
      } else {
        setError(result.error as unknown as ApiError);
        setSuccess(false);
      }
    } catch (err) {
      if (!isMountedRef.current) return;

      const apiError = err as ApiError;
      setError(apiError);
      setSuccess(false);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, dependencies);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(() => {
    if (cache && cacheKey) {
      cacheUtils.clear(cacheKey);
    }
    execute();
  }, [execute, cache, cacheKey]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setSuccess(false);
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    success,
    execute,
    refetch,
    clearError,
    reset,
  };
};

// Хук для CRUD операций
export const useCrud = <T extends { id: number }>(
  baseUrl: string,
  options: {
    cache?: boolean;
    cacheTtl?: number;
  } = {}
) => {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const { cache = true, cacheTtl = 300000 } = options;

  // Получение всех элементов
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiMethods.get<T[]>(baseUrl);
      if (result.success && result.data) {
        setItems(result.data);
      } else {
        setError(result.error as unknown as ApiError);
      }
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  // Получение элемента по ID
  const fetchById = useCallback(async (id: number): Promise<T | null> => {
    try {
      const result = await apiMethods.get<T>(`${baseUrl}/${id}`);
      if (result.success && result.data) {
        return result.data;
      } else {
        setError(result.error as unknown as ApiError);
        return null;
      }
    } catch (err) {
      setError(err as ApiError);
      return null;
    }
  }, [baseUrl]);

  // Создание элемента
  const create = useCallback(async (data: Omit<T, 'id'>): Promise<T | null> => {
    try {
      const result = await apiMethods.post<T>(baseUrl, data);
      if (result.success && result.data) {
        setItems(prev => [result.data!, ...prev]);
        if (cache) {
          cacheUtils.clear(baseUrl);
        }
        return result.data;
      } else {
        setError(result.error as unknown as ApiError);
        return null;
      }
    } catch (err) {
      setError(err as ApiError);
      return null;
    }
  }, [baseUrl, cache]);

  // Обновление элемента
  const update = useCallback(async (id: number, data: Partial<T>): Promise<T | null> => {
    try {
      const result = await apiMethods.put<T>(`${baseUrl}/${id}`, data);
      if (result.success && result.data) {
        setItems(prev => prev.map(item => item.id === id ? result.data! : item));
        if (cache) {
          cacheUtils.clear(baseUrl);
        }
        return result.data;
      } else {
        setError(result.error as unknown as ApiError);
        return null;
      }
    } catch (err) {
      setError(err as ApiError);
      return null;
    }
  }, [baseUrl, cache]);

  // Удаление элемента
  const remove = useCallback(async (id: number): Promise<boolean> => {
    try {
      const result = await apiMethods.delete(`${baseUrl}/${id}`);
      if (result.success) {
        setItems(prev => prev.filter(item => item.id !== id));
        if (cache) {
          cacheUtils.clear(baseUrl);
        }
        return true;
      } else {
        setError(result.error as unknown as ApiError);
        return false;
      }
    } catch (err) {
      setError(err as ApiError);
      return false;
    }
  }, [baseUrl, cache]);

  // Частичное обновление
  const patch = useCallback(async (id: number, data: Partial<T>): Promise<T | null> => {
    try {
      const result = await apiMethods.patch<T>(`${baseUrl}/${id}`, data);
      if (result.success && result.data) {
        setItems(prev => prev.map(item => item.id === id ? result.data! : item));
        if (cache) {
          cacheUtils.clear(baseUrl);
        }
        return result.data;
      } else {
        setError(result.error as unknown as ApiError);
        return null;
      }
    } catch (err) {
      setError(err as ApiError);
      return null;
    }
  }, [baseUrl, cache]);

  return {
    items,
    loading,
    error,
    fetchAll,
    fetchById,
    create,
    update,
    patch,
    remove,
    setItems,
  };
};

// Хук для пагинации
export const usePagination = <T>(
  apiCall: (page: number, limit: number) => Promise<ApiResponse<{ data: T[]; total: number; page: number; limit: number }>>,
  initialPage: number = 1,
  initialLimit: number = 20
) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const fetchPage = useCallback(async (pageNum: number, pageLimit: number = limit) => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiCall(pageNum, pageLimit);
      if (result.success && result.data) {
        setData(result.data.data);
        setTotal(result.data.total);
        setTotalPages(Math.ceil(result.data.total / pageLimit));
        setPage(pageNum);
        setLimit(pageLimit);
      } else {
        setError(result.error as unknown as ApiError);
      }
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }, [apiCall, limit]);

  const goToPage = useCallback((pageNum: number) => {
    if (pageNum >= 1 && pageNum <= totalPages) {
      fetchPage(pageNum);
    }
  }, [fetchPage, totalPages]);

  const changeLimit = useCallback((newLimit: number) => {
    fetchPage(1, newLimit);
  }, [fetchPage]);

  const nextPage = useCallback(() => {
    if (page < totalPages) {
      goToPage(page + 1);
    }
  }, [page, totalPages, goToPage]);

  const prevPage = useCallback(() => {
    if (page > 1) {
      goToPage(page - 1);
    }
  }, [page, goToPage]);

  useEffect(() => {
    fetchPage(page, limit);
  }, []);

  return {
    data,
    loading,
    error,
    page,
    limit,
    total,
    totalPages,
    goToPage,
    changeLimit,
    nextPage,
    prevPage,
    refetch: () => fetchPage(page, limit),
  };
};

// Хук для работы с формами
export const useForm = <T>(
  initialData: T,
  validator?: (data: T) => { field: string; message: string }[]
) => {
  const [data, setData] = useState<T>(initialData);
  const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = useCallback((field: keyof T, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    
    // Очищаем ошибку для этого поля
    setErrors(prev => prev.filter(error => error.field !== field));
  }, []);

  const validate = useCallback(() => {
    if (!validator) return true;
    
    const validationErrors = validator(data);
    setErrors(validationErrors);
    return validationErrors.length === 0;
  }, [validator]);

  const submit = useCallback(async (onSubmit: (data: T) => Promise<void>) => {
    if (!validate()) return false;

    setIsSubmitting(true);
    try {
      await onSubmit(data);
      setIsDirty(false);
      return true;
    } catch (error) {
      console.error('Form submission error:', error);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [data, validate]);

  const reset = useCallback(() => {
    setData(initialData);
    setErrors([]);
    setIsDirty(false);
    setIsSubmitting(false);
  }, [initialData]);

  const getFieldError = useCallback((field: keyof T) => {
    return errors.find(error => error.field === field)?.message || null;
  }, [errors]);

  return {
    data,
    errors,
    isDirty,
    isSubmitting,
    updateField,
    validate,
    submit,
    reset,
    getFieldError,
    setData,
  };
};
