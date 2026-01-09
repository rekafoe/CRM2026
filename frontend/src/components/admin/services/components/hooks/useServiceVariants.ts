import { useState, useCallback, useEffect } from 'react';
import { VariantWithTiers } from '../ServiceVariantsTable.types';
import {
  getServiceVariants,
  getServiceVariantTiers,
} from '../../../../../services/pricing';

/**
 * Хук для управления вариантами услуги
 */
export function useServiceVariants(serviceId: number) {
  const [variants, setVariants] = useState<VariantWithTiers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVariants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedVariants = await getServiceVariants(serviceId);
      const variantsWithTiers: VariantWithTiers[] = await Promise.all(
        loadedVariants.map(async (variant) => {
          try {
            const tiers = await getServiceVariantTiers(serviceId, variant.id);
            return { ...variant, tiers, loadingTiers: false };
          } catch (err) {
            console.error(`Ошибка загрузки tiers для варианта ${variant.id}:`, err);
            return { ...variant, tiers: [], loadingTiers: false };
          }
        })
      );
      setVariants(variantsWithTiers);
    } catch (err) {
      console.error('Ошибка загрузки вариантов:', err);
      setError('Не удалось загрузить варианты услуги');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void loadVariants();
  }, [loadVariants]);

  return {
    variants,
    setVariants,
    loading,
    error,
    setError,
    reload: loadVariants,
  };
}
