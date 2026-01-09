import { useRef } from 'react';
import { ServiceVolumeTier } from '../../../../types/pricing';

/**
 * Простой кэш для tiers вариантов
 * Кэширует результаты на время сессии
 */
const cache = new Map<string, { data: Record<number, ServiceVolumeTier[]>; timestamp: number }>();
const CACHE_TTL = 30000; // 30 секунд

/**
 * Хук для работы с кэшем tiers
 * Использует стабильные ссылки на функции для избежания рекурсии
 */
export function useTiersCache() {
  // Используем ref для стабильных функций, чтобы не создавать новые ссылки
  const cacheRef = useRef({
    get: (serviceId: number): Record<number, ServiceVolumeTier[]> | null => {
      const key = `service-${serviceId}-variant-tiers`;
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
    },
    set: (serviceId: number, data: Record<number, ServiceVolumeTier[]>) => {
      const key = `service-${serviceId}-variant-tiers`;
      cache.set(key, {
        data,
        timestamp: Date.now(),
      });
    },
    invalidate: (serviceId: number) => {
      const key = `service-${serviceId}-variant-tiers`;
      cache.delete(key);
    },
  });

  return cacheRef.current;
}
