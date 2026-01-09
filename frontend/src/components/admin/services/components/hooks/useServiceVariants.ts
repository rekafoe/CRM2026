import { useState, useCallback, useEffect } from 'react';
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

  const loadVariants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Проверяем кэш
      const cachedTiers = cache.get(serviceId);
      
      // Загружаем варианты и tiers параллельно
      const [loadedVariants, allTiers] = await Promise.all([
        getServiceVariants(serviceId),
        cachedTiers 
          ? Promise.resolve(cachedTiers)
          : getAllVariantTiers(serviceId)
              .then((tiers) => {
                // Сохраняем в кэш
                cache.set(serviceId, tiers);
                return tiers;
              })
              .catch(() => ({} as Record<number, any[]>)), // Fallback на пустой объект при ошибке
      ]);
      
      // Сопоставляем tiers с вариантами
      const variantsWithTiers: VariantWithTiers[] = loadedVariants.map((variant: any) => ({
        ...variant,
        tiers: allTiers[variant.id] || [],
        loadingTiers: false,
      }));
      
      setVariants(variantsWithTiers);
    } catch (err) {
      console.error('Ошибка загрузки вариантов:', err);
      setError('Не удалось загрузить варианты услуги');
    } finally {
      setLoading(false);
    }
  }, [serviceId, cache]);

  useEffect(() => {
    void loadVariants();
  }, [loadVariants]);

  const invalidateCache = useCallback(() => {
    cache.invalidate(serviceId);
  }, [serviceId, cache]);

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
