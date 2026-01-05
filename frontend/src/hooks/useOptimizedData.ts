import { useState, useEffect, useCallback, useRef } from 'react';

interface UseOptimizedDataOptions<T> {
  fetchFn: () => Promise<T>;
  cacheKey: string;
  cacheTTL?: number;
  dependencies?: any[];
  enabled?: boolean;
}

interface UseOptimizedDataResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  isStale: boolean;
}

// Простой кэш в памяти
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

export function useOptimizedData<T>({
  fetchFn,
  cacheKey,
  cacheTTL = 5 * 60 * 1000, // 5 минут по умолчанию
  dependencies = [],
  enabled = true
}: UseOptimizedDataOptions<T>): UseOptimizedDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    // Проверяем кэш
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      setData(cached.data);
      setIsStale(false);
      return;
    }

    // Отменяем предыдущий запрос
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      const result = await fetchFn();
      
      // Сохраняем в кэш
      cache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
        ttl: cacheTTL
      });

      setData(result);
      setIsStale(false);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchFn, cacheKey, cacheTTL, enabled]);

  const refetch = useCallback(async () => {
    // Очищаем кэш и загружаем заново
    cache.delete(cacheKey);
    await fetchData();
  }, [cacheKey, fetchData]);

  // Эффект для загрузки данных
  useEffect(() => {
    fetchData();
  }, [fetchData, ...dependencies]);

  // Эффект для проверки устаревания данных
  useEffect(() => {
    const cached = cache.get(cacheKey);
    if (cached) {
      const isDataStale = Date.now() - cached.timestamp > cached.ttl * 0.8; // 80% от TTL
      setIsStale(isDataStale);
    }
  }, [cacheKey, cacheTTL]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    refetch,
    isStale
  };
}

// Утилита для очистки кэша
export function clearCache(pattern?: string) {
  if (pattern) {
    const regex = new RegExp(pattern);
    for (const key of cache.keys()) {
      if (regex.test(key)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
}

// Утилита для получения размера кэша
export function getCacheSize() {
  return cache.size;
}