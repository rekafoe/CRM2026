import { useRef, useCallback } from 'react';
import { ServiceVolumeTier } from '../../../../types/pricing';

/**
 * Простой кэш для tiers вариантов
 * Кэширует результаты на время сессии
 */
const cache = new Map<string, { data: Record<number, ServiceVolumeTier[]>; timestamp: number }>();
const CACHE_TTL = 30000; // 30 секунд

export function useTiersCache() {
  const getCacheKey = useCallback((serviceId: number) => {
    return `service-${serviceId}-variant-tiers`;
  }, []);

  const get = useCallback((serviceId: number): Record<number, ServiceVolumeTier[]> | null => {
    const key = getCacheKey(serviceId);
    const cached = cache.get(key);
    
    if (!cached) {
      return null;
    }
    
    const age = Date.now() - cached.timestamp;
    if (age > CACHE_TTL) {
      cache.delete(key);
      return null;
    }
    
    return cached.data;
  }, [getCacheKey]);

  const set = useCallback((serviceId: number, data: Record<number, ServiceVolumeTier[]>) => {
    const key = getCacheKey(serviceId);
    cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }, [getCacheKey]);

  const invalidate = useCallback((serviceId: number) => {
    const key = getCacheKey(serviceId);
    cache.delete(key);
  }, [getCacheKey]);

  return { get, set, invalidate };
}
