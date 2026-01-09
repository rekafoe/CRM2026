import { useState, useCallback, useEffect, useRef } from 'react';
import { VariantWithTiers } from '../ServiceVariantsTable.types';
import {
  getServiceVariants,
  getAllVariantTiers,
} from '../../../../../services/pricing';
import { useTiersCache } from '../../hooks/useTiersCache';

/**
 * Хук для управления вариантами услуги
 * Оптимизация: 
 * - использует batch запрос для загрузки всех tiers одним запросом
 * - кэширует результаты для уменьшения количества запросов
 */
export function useServiceVariants(serviceId: number) {
  const [variants, setVariants] = useState<VariantWithTiers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cache = useTiersCache();

  // Используем useRef для стабильной ссылки на cache
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  const loadVariants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Проверяем кэш через ref для избежания зависимостей
      const cachedTiers = cacheRef.current.get(serviceId);
      
      // Загружаем варианты и tiers параллельно
      const [loadedVariants, allTiers] = await Promise.all([
        getServiceVariants(serviceId),
        cachedTiers
          ? Promise.resolve(cachedTiers)
          : getAllVariantTiers(serviceId)
              .then((tiers) => {
                // Сохраняем в кэш
                cacheRef.current.set(serviceId, tiers);
                return tiers;
              }),
      ]);

      // Сопоставляем tiers с вариантами
      const variantsWithTiers: VariantWithTiers[] = loadedVariants.map((variant: any) => ({
        ...variant,
        tiers: allTiers[variant.id] || [],
        loadingTiers: false,
      }));

      setVariants(variantsWithTiers);
    } catch (err: any) {
      console.error('Ошибка загрузки вариантов:', err);
      const errorMessage = err?.response?.data?.error || err?.message || 'Не удалось загрузить варианты услуги';
      setError(errorMessage);
      // Не скрываем ошибку автоматически - пользователь должен видеть проблему
    } finally {
      setLoading(false);
    }
  }, [serviceId]); // cache через ref, не добавляем в зависимости

  useEffect(() => {
    void loadVariants();
  }, [loadVariants]);

  const invalidateCache = useCallback(() => {
    cacheRef.current.invalidate(serviceId);
  }, [serviceId]); // cache через ref, не добавляем в зависимости

  return {
    variants,
    setVariants,
    loading,
    error,
    setError,
    reload: loadVariants,
    invalidateCache,
  };
}
