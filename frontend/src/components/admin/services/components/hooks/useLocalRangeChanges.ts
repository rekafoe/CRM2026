import { useState, useCallback, useMemo } from 'react';
import { VariantWithTiers } from '../ServiceVariantsTable.types';
import { PriceRange, PriceRangeUtils } from '../../../../../hooks/usePriceRanges';
import { calculateCommonRanges } from '../ServiceVariantsTable.utils';

/**
 * Тип для отслеживания изменений диапазонов
 */
export interface RangeChange {
  type: 'add' | 'edit' | 'remove';
  boundary?: number;
  rangeIndex?: number;
  newBoundary?: number;
}

/**
 * Тип для отслеживания изменений цен
 */
export interface PriceChange {
  variantId: number;
  minQty: number;
  newPrice: number;
}

/**
 * Хук для управления локальными изменениями диапазонов и цен
 */
export function useLocalRangeChanges(
  initialVariants: VariantWithTiers[],
  onSaveChanges: (rangeChanges: RangeChange[], priceChanges: PriceChange[]) => Promise<void>
) {
  const [localVariants, setLocalVariants] = useState<VariantWithTiers[]>(initialVariants);
  const [rangeChanges, setRangeChanges] = useState<RangeChange[]>([]);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Вычисляем общие диапазоны на основе локальных вариантов
  const commonRanges = useMemo(() => calculateCommonRanges(localVariants), [localVariants]);
  const commonRangesAsPriceRanges: PriceRange[] = useMemo(() => {
    return commonRanges.map(r => ({
      minQty: r.min_qty,
      maxQty: r.max_qty,
      price: 0,
    }));
  }, [commonRanges]);

  // Синхронизировать локальное состояние с внешним
  const syncWithExternal = useCallback((externalVariants: VariantWithTiers[]) => {
    setLocalVariants(externalVariants);
    setRangeChanges([]);
    setPriceChanges([]);
    setHasUnsavedChanges(false);
  }, []);

  // Локальное добавление диапазона
  const addRangeBoundary = useCallback((boundary: number) => {
    const currentVariants = [...localVariants];

    // Создаем новые диапазоны для всех вариантов
    const updatedVariants = currentVariants.map((variant) => {
      const currentRanges = variant.tiers.map((t) => ({
        minQty: t.minQuantity,
        price: t.rate,
      }));

      // Используем PriceRangeUtils для добавления границы
      const newRanges = PriceRangeUtils.addBoundary(currentRanges, boundary);
      const normalizedRanges = PriceRangeUtils.normalize(newRanges);

      // Сохраняем цены из исходных диапазонов
      const originalRangePrices = new Map<number, number>();
      variant.tiers.forEach((originalTier) => {
        const originalMin = originalTier.minQuantity;
        const nextTier = variant.tiers.find((t) => t.minQuantity > originalMin);
        const originalMax = nextTier ? nextTier.minQuantity : Infinity;

        normalizedRanges.forEach((newRange: PriceRange) => {
          if (newRange.minQty >= originalMin && newRange.minQty < originalMax) {
            if (!originalRangePrices.has(newRange.minQty)) {
              originalRangePrices.set(newRange.minQty, originalTier.rate);
            }
          }
        });
      });

        return {
          ...variant,
          tiers: normalizedRanges.map((t: PriceRange) => ({
          id: 0, // Локальный ID
          serviceId: variant.tiers[0]?.serviceId || 0,
          variantId: variant.id,
          minQuantity: t.minQty,
          rate: originalRangePrices.get(t.minQty) || t.price,
          isActive: true,
        })),
      };
    });

    setLocalVariants(updatedVariants);
    setRangeChanges(prev => [...prev, { type: 'add', boundary }]);
    setHasUnsavedChanges(true);
  }, [localVariants]);

  // Локальное редактирование диапазона
  const editRangeBoundary = useCallback((rangeIndex: number, newBoundary: number) => {
    const currentVariants = [...localVariants];

    // Находим текущую границу диапазона
    const allMinQtys = new Set<number>();
    currentVariants.forEach((v) => {
      v.tiers.forEach((t) => allMinQtys.add(t.minQuantity));
    });
    const sortedMinQtys = Array.from(allMinQtys).sort((a, b) => a - b);
    const currentBoundary = sortedMinQtys[rangeIndex];

    if (currentBoundary === undefined) return;

    // Создаем новые диапазоны для всех вариантов
    const updatedVariants = currentVariants.map((variant) => {
      const currentRanges = variant.tiers.map((t) => ({
        minQty: t.minQuantity,
        price: t.rate,
      }));

      const tierIndex = currentRanges.findIndex((r) => r.minQty === currentBoundary);
      if (tierIndex === -1) return variant;

      const newRanges = PriceRangeUtils.editBoundary(currentRanges, tierIndex, newBoundary);
      const normalizedRanges = PriceRangeUtils.normalize(newRanges);

      // Сохраняем существующие цены
      const preservedPrices = new Map<number, number>();
      variant.tiers.forEach((t) => {
        if (t.minQuantity !== currentBoundary) {
          preservedPrices.set(t.minQuantity, t.rate);
        }
      });

      return {
        ...variant,
        tiers: normalizedRanges
            .filter((r: PriceRange) => preservedPrices.has(r.minQty))
            .map((t: PriceRange) => ({
            id: 0,
            serviceId: variant.tiers[0]?.serviceId || 0,
            variantId: variant.id,
            minQuantity: t.minQty,
            rate: preservedPrices.get(t.minQty)!,
            isActive: true,
          })),
      };
    });

    setLocalVariants(updatedVariants);
    setRangeChanges(prev => [...prev, { type: 'edit', rangeIndex, newBoundary }]);
    setHasUnsavedChanges(true);
  }, [localVariants]);

  // Локальное удаление диапазона
  const removeRange = useCallback((rangeIndex: number) => {
    const currentVariants = [...localVariants];

    // Находим границу для удаления
    const allMinQtys = new Set<number>();
    currentVariants.forEach((v) => {
      v.tiers.forEach((t) => allMinQtys.add(t.minQuantity));
    });
    const sortedMinQtys = Array.from(allMinQtys).sort((a, b) => a - b);
    const rangeToRemove = sortedMinQtys[rangeIndex];

    if (rangeToRemove === undefined) return;

    // Создаем новые диапазоны для всех вариантов
    const updatedVariants = currentVariants.map((variant) => {
      const currentRanges = variant.tiers.map((t) => ({
        minQty: t.minQuantity,
        price: t.rate,
      }));

      const tierIndex = currentRanges.findIndex((r) => r.minQty === rangeToRemove);
      if (tierIndex === -1) return variant;

      const newRanges = PriceRangeUtils.removeRange(currentRanges, tierIndex);
      const normalizedRanges = PriceRangeUtils.normalize(newRanges);

      // Сохраняем существующие цены
      const preservedPrices = new Map<number, number>();
      variant.tiers.forEach((t) => {
        if (t.minQuantity !== rangeToRemove) {
          preservedPrices.set(t.minQuantity, t.rate);
        }
      });

      return {
        ...variant,
        tiers: normalizedRanges
            .filter((r: PriceRange) => preservedPrices.has(r.minQty))
            .map((t: PriceRange) => ({
            id: 0,
            serviceId: variant.tiers[0]?.serviceId || 0,
            variantId: variant.id,
            minQuantity: t.minQty,
            rate: preservedPrices.get(t.minQty)!,
            isActive: true,
          })),
      };
    });

    setLocalVariants(updatedVariants);
    setRangeChanges(prev => [...prev, { type: 'remove', rangeIndex }]);
    setHasUnsavedChanges(true);
  }, [localVariants]);

  // Локальное изменение цены
  const changePrice = useCallback((variantId: number, minQty: number, newPrice: number) => {
    setLocalVariants(prev =>
      prev.map(variant => {
        if (variant.id !== variantId) return variant;

        const updatedTiers = variant.tiers.map(tier => {
          if (tier.minQuantity === minQty) {
            return { ...tier, rate: newPrice };
          }
          return tier;
        });

        return { ...variant, tiers: updatedTiers };
      })
    );

    // Добавляем или обновляем изменение цены
    setPriceChanges(prev => {
      const existingIndex = prev.findIndex(change =>
        change.variantId === variantId && change.minQty === minQty
      );

      if (existingIndex >= 0) {
        const newChanges = [...prev];
        newChanges[existingIndex] = { variantId, minQty, newPrice };
        return newChanges;
      } else {
        return [...prev, { variantId, minQty, newPrice }];
      }
    });

    setHasUnsavedChanges(true);
  }, []);

  // Сохранение всех изменений на сервер
  const saveChanges = useCallback(async () => {
    if (rangeChanges.length === 0 && priceChanges.length === 0) return;

    try {
      await onSaveChanges(rangeChanges, priceChanges);

      // Очищаем локальные изменения после успешного сохранения
      setRangeChanges([]);
      setPriceChanges([]);
      setHasUnsavedChanges(false);
    } catch (error) {
      throw error; // Пробрасываем ошибку выше
    }
  }, [rangeChanges, priceChanges, onSaveChanges]);

  // Отмена изменений
  const cancelChanges = useCallback(() => {
    setLocalVariants(initialVariants);
    setRangeChanges([]);
    setPriceChanges([]);
    setHasUnsavedChanges(false);
  }, [initialVariants]);

  return {
    localVariants,
    commonRangesAsPriceRanges,
    hasUnsavedChanges,
    rangeChanges,
    priceChanges,

    // Функции для локальных изменений
    addRangeBoundary,
    editRangeBoundary,
    removeRange,
    changePrice,

    // Функции для сохранения/отмены
    saveChanges,
    cancelChanges,
    syncWithExternal,
  };
}