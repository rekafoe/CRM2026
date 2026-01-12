import { useCallback, useRef, useEffect } from 'react';
import { VariantWithTiers } from '../ServiceVariantsTable.types';
import {
  createServiceVariant,
  updateServiceVariant,
  deleteServiceVariant,
  createServiceVariantTier,
  updateServiceVariantTier,
  deleteServiceVariantTier,
  getServiceVariantTiers,
  getAllVariantTiers,
  addRangeBoundary as addRangeBoundaryAPI,
  removeRangeBoundary as removeRangeBoundaryAPI,
  updateRangeBoundary as updateRangeBoundaryAPI,
  updateVariantPrice as updateVariantPriceAPI,
} from '../../../../../services/pricing';
import { PriceRangeUtils } from '../../../../../hooks/usePriceRanges';

console.log('useVariantOperations: createServiceVariant function:', createServiceVariant);

type Tier = { min_qty: number; max_qty?: number; unit_price: number };

const defaultTiers = (): Tier[] => [
  { min_qty: 1, max_qty: undefined, unit_price: 0 },
];

/**
 * Хук для операций с вариантами и диапазонами
 */
export function useVariantOperations(
  serviceId: number,
  variants: VariantWithTiers[],
  setVariants: React.Dispatch<React.SetStateAction<VariantWithTiers[]>>,
  setError: (error: string | null) => void,
  reloadVariants: () => Promise<void>,
  invalidateCache?: () => void
) {
  // Refs для debounce изменения цен
  const priceChangeTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const priceChangeOriginalValuesRef = useRef<Map<string, number>>(new Map());
  
  // Используем refs для стабильных ссылок на функции, чтобы избежать рекурсии
  const reloadVariantsRef = useRef(reloadVariants);
  const invalidateCacheRef = useRef(invalidateCache);
  const variantsRef = useRef(variants);
  
  // Обновляем refs при изменении
  reloadVariantsRef.current = reloadVariants;
  invalidateCacheRef.current = invalidateCache;
  variantsRef.current = variants;

  // Очистка таймеров при размонтировании
  useEffect(() => {
    return () => {
      priceChangeTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
      priceChangeTimeoutRef.current.clear();
      priceChangeOriginalValuesRef.current.clear();
    };
  }, []);

  const createVariant = useCallback(async (variantName: string, parameters: Record<string, any> = {}) => {
    try {
      // Используем максимальный sortOrder + 1 для уникальности
      const currentVariants = variantsRef.current;
      const maxSortOrder = currentVariants.length > 0 ? Math.max(...currentVariants.map(v => v.sortOrder)) : 0;

      const newVariant = await createServiceVariant(serviceId, {
        variantName,
        parameters,
        sortOrder: maxSortOrder + 1,
        isActive: true,
      });

      // Создаем вариант с tiers для немедленного отображения
      const newVariantWithTiers: VariantWithTiers = {
        ...newVariant,
        tiers: defaultTiers().map((t) => ({
          id: 0,
          serviceId,
          variantId: newVariant.id,
          minQuantity: t.min_qty,
          rate: t.unit_price,
          isActive: true,
        })),
      };

      // Инвалидируем кэш tiers для нового варианта
      invalidateCacheRef.current?.();

      // Добавляем новый вариант в локальное состояние
      setVariants((prev) => [...prev, newVariantWithTiers]);

      return newVariantWithTiers;

      // Обновляем tiers для нового варианта через небольшую задержку
      setTimeout(async () => {
        try {
          // Получаем tiers только для нового варианта
          const newVariantTiers = await getServiceVariantTiers(serviceId, newVariant.id);

          // Обновляем локальный вариант с актуальными tiers
          setVariants((prev) =>
            prev.map((v) =>
              v.id === newVariant.id
                ? { ...v, tiers: newVariantTiers }
                : v
            )
          );
        } catch (err) {
          console.error('Ошибка обновления tiers после создания варианта:', err);
        }
      }, 300);

      return newVariantWithTiers;
    } catch (err) {
      console.error('Ошибка создания варианта:', err);
      setError('Не удалось создать вариант');
      throw err;
    }
  }, [serviceId, setVariants, setError]); // variants через ref, не добавляем в зависимости

  const updateVariantName = useCallback(async (variantId: number, newName: string) => {
    try {
      const variant = variants.find((v) => v.id === variantId);
      if (!variant) return;

      const oldName = variant.variantName;
      
      // Обновляем локально
      setVariants((prev) =>
        prev.map((v) => (v.variantName === oldName ? { ...v, variantName: newName } : v))
      );

      // Обновляем на сервере
      const variantsToUpdate = variants.filter((v) => v.variantName === oldName);
      await Promise.all(
        variantsToUpdate.map((v) =>
          updateServiceVariant(serviceId, v.id, {
            variantName: newName,
            parameters: v.parameters,
          })
        )
      );
    } catch (err) {
      console.error('Ошибка обновления названия варианта:', err);
      setError('Не удалось обновить название варианта');
      invalidateCacheRef.current?.();
      await reloadVariantsRef.current();
    }
  }, [serviceId, variants, setVariants, setError]); // reloadVariants через ref

  const updateVariantParams = useCallback(async (variantId: number, params: Record<string, any>) => {
    try {
      setVariants((prev) =>
        prev.map((v) => (v.id === variantId ? { ...v, parameters: params } : v))
      );

      await updateServiceVariant(serviceId, variantId, {
        variantName: variants.find((v) => v.id === variantId)?.variantName || '',
        parameters: params,
      });
    } catch (err) {
      console.error('Ошибка обновления параметров варианта:', err);
      setError('Не удалось обновить параметры варианта');
      invalidateCacheRef.current?.();
      await reloadVariantsRef.current();
    }
  }, [serviceId, variants, setVariants, setError]); // reloadVariants через ref

  const deleteVariant = useCallback(async (variantId: number, skipConfirm: boolean = false) => {
    if (!skipConfirm && !confirm('Удалить этот вариант? Все связанные диапазоны цен будут удалены.')) {
      return;
    }
    try {
      await deleteServiceVariant(serviceId, variantId);
      setVariants((prev) => prev.filter((v) => v.id !== variantId));
    } catch (err) {
      console.error('Ошибка удаления варианта:', err);
      setError('Не удалось удалить вариант');
    }
  }, [serviceId, setVariants, setError]);

  const changePrice = useCallback(async (
    variantId: number,
    minQty: number,
    newPrice: number
  ) => {
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) return;

    const key = `${variantId}-${minQty}`;
    const tier = variant.tiers.find((t) => t.minQuantity === minQty);

    // Сохраняем оригинальное значение при первом изменении
    if (!priceChangeOriginalValuesRef.current.has(key)) {
      priceChangeOriginalValuesRef.current.set(key, tier?.rate ?? 0);
    }

    // Обновляем локально
    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== variantId) return v;
        if (!tier) {
          return {
            ...v,
            tiers: [
              ...v.tiers,
              {
                id: 0,
                serviceId,
                variantId: v.id,
                minQuantity: minQty,
                rate: newPrice,
                isActive: true,
              },
            ].sort((a, b) => a.minQuantity - b.minQuantity),
          };
        }
        return {
          ...v,
          tiers: v.tiers.map((t) =>
            t.minQuantity === minQty ? { ...t, rate: newPrice } : t
          ),
        };
      })
    );

    // Очищаем предыдущий таймер
    const existingTimeout = priceChangeTimeoutRef.current.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Устанавливаем новый таймер для сохранения
    const timeout = setTimeout(async () => {
      // Используем ref для получения актуального значения variants
      const currentVariant = variantsRef.current.find((v) => v.id === variantId);
      if (!currentVariant) return;

      const currentTier = currentVariant.tiers.find((t) => t.minQuantity === minQty);
      if (!currentTier || currentTier.id === 0) {
        // Создаем новый tier (используем старый API для обратной совместимости)
        const created = await createServiceVariantTier(serviceId, variantId, {
          minQuantity: minQty,
          rate: newPrice,
        });
        setVariants((prev) =>
          prev.map((v) => {
            if (v.id !== variantId) return v;
            const existingTier = v.tiers.find((t) => t.minQuantity === minQty && t.id === 0);
            if (existingTier) {
              return {
                ...v,
                tiers: v.tiers.map((t) => (t.minQuantity === minQty && t.id === 0 ? created : t)),
              };
            }
            return v;
          })
        );
      } else {
        // Используем новый оптимизированный API для обновления цены
        try {
          await updateVariantPriceAPI(serviceId, variantId, minQty, newPrice);
        } catch (err) {
          // Fallback на старый API, если новый не работает (для обратной совместимости)
          console.warn('Failed to use new API, falling back to old API:', err);
          await updateServiceVariantTier(serviceId, variantId, currentTier.id, {
            minQuantity: currentTier.minQuantity,
            rate: newPrice,
          });
        }
      }

      priceChangeTimeoutRef.current.delete(key);
      priceChangeOriginalValuesRef.current.delete(key);
    }, 1000);

    priceChangeTimeoutRef.current.set(key, timeout);
  }, [serviceId, setVariants]); // variants через ref, не добавляем в зависимости

  const addRangeBoundary = useCallback(async (boundary: number) => {
    try {
      // Используем новый оптимизированный API - одна операция вместо сотен!
      await addRangeBoundaryAPI(serviceId, boundary);
      
      // Перезагружаем данные с сервера
      const allTiersByVariantId = await getAllVariantTiers(serviceId);
      
      // Обновляем локальное состояние
      const updatedVariants = variants.map((variant) => {
        const variantTiers = allTiersByVariantId[variant.id] || [];
        return {
          ...variant,
          tiers: variantTiers,
        };
      });
      
      setVariants(updatedVariants);
    } catch (err) {
      console.error('Ошибка добавления границы диапазона:', err);
      setError('Не удалось добавить границу диапазона');
    }
  }, [serviceId, variants, setVariants, setError]);

  const editRangeBoundary = useCallback(async (rangeIndex: number, newBoundary: number) => {
    try {
      // Находим текущую границу диапазона
      const allMinQtys = new Set<number>();
      variants.forEach((v) => {
        v.tiers.forEach((t) => allMinQtys.add(t.minQuantity));
      });
      const sortedMinQtys = Array.from(allMinQtys).sort((a, b) => a - b);
      const oldMinQuantity = sortedMinQtys[rangeIndex];
      
      if (oldMinQuantity === undefined) {
        setError('Диапазон не найден');
        return;
      }
      
      // Используем новый оптимизированный API - одна операция!
      await updateRangeBoundaryAPI(serviceId, oldMinQuantity, newBoundary);
      
      // Перезагружаем данные с сервера
      const allTiersByVariantId = await getAllVariantTiers(serviceId);
      
      // Обновляем локальное состояние
      const updatedVariants = variants.map((variant) => {
        const variantTiers = allTiersByVariantId[variant.id] || [];
        return {
          ...variant,
          tiers: variantTiers,
        };
      });
      
      setVariants(updatedVariants);
    } catch (err) {
      console.error('Ошибка редактирования границы диапазона:', err);
      setError('Не удалось отредактировать границу диапазона');
    }
  }, [serviceId, variants, setVariants, setError]);

  const removeRange = useCallback(async (rangeIndex: number) => {
    try {
      // Находим границу диапазона для удаления
      const allMinQtys = new Set<number>();
      variants.forEach((v) => {
        v.tiers.forEach((t) => allMinQtys.add(t.minQuantity));
      });
      const sortedMinQtys = Array.from(allMinQtys).sort((a, b) => a - b);
      const minQuantityToRemove = sortedMinQtys[rangeIndex];
      
      if (minQuantityToRemove === undefined) {
        setError('Диапазон не найден');
        return;
      }
      
      // Используем новый оптимизированный API - одна операция удаляет все связанные цены!
      await removeRangeBoundaryAPI(serviceId, minQuantityToRemove);
      
      // Перезагружаем данные с сервера
      const allTiersByVariantId = await getAllVariantTiers(serviceId);
      
      // Обновляем локальное состояние
      const updatedVariants = variants.map((variant) => {
        const variantTiers = allTiersByVariantId[variant.id] || [];
        return {
          ...variant,
          tiers: variantTiers,
        };
      });
      
      setVariants(updatedVariants);
    } catch (err) {
      console.error('Ошибка удаления диапазона:', err);
      setError('Не удалось удалить диапазон');
    }
  }, [serviceId, variants, setVariants, setError]);

  return {
    createVariant,
    updateVariantName,
    updateVariantParams,
    deleteVariant,
    changePrice,
    addRangeBoundary,
    editRangeBoundary,
    removeRange,
  };
}
