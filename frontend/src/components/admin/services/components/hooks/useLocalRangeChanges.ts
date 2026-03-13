import { useState, useCallback, useMemo } from 'react';
import { VariantWithTiers } from '../ServiceVariantsTable.types';
import { PriceRange, PriceRangeUtils } from '../../../../../hooks/usePriceRanges';
import { calculateCommonRanges } from '../ServiceVariantsTable.utils';

// Локальное определение defaultTiers для создания новых вариантов
const defaultTiers = () => [
  { min_qty: 1, max_qty: undefined, unit_price: 0 },
];

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
 * Тип для отслеживания изменений вариантов
 */
export interface VariantChange {
  type: 'create' | 'delete' | 'update';
  variantId?: number;
  variantName?: string;
  parameters?: Record<string, any>;
  oldVariantName?: string;
}

/**
 * Единый объект несохранённых изменений — одна модель для кнопки «Сохранить».
 */
export interface PendingChanges {
  rangeChanges: RangeChange[];
  priceChanges: PriceChange[];
  variantChanges: VariantChange[];
}

/**
 * Хук для управления локальными изменениями диапазонов и цен.
 * Сохранение: один вызов onSaveChanges(pending) применяет все изменения.
 */
export function useLocalRangeChanges(
  initialVariants: VariantWithTiers[],
  onSaveChanges: (pending: PendingChanges) => Promise<void>
) {
  const [localVariants, setLocalVariants] = useState<VariantWithTiers[]>(initialVariants);
  const [rangeChanges, setRangeChanges] = useState<RangeChange[]>([]);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [variantChanges, setVariantChanges] = useState<VariantChange[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [nextVariantId, setNextVariantId] = useState(() => {
    // Находим максимальный ID среди существующих вариантов
    const maxId = initialVariants.length > 0 ? Math.max(...initialVariants.map(v => v.id)) : 0;
    return maxId + 1;
  });


  // Синхронизировать локальное состояние с внешним
  const syncWithExternal = useCallback((externalVariants: VariantWithTiers[]) => {
    // Глубоко копируем tiers, чтобы варианты не делили ссылки
    setLocalVariants(
      externalVariants.map((variant) => ({
        ...variant,
        tiers: (variant.tiers || []).map((tier) => ({ ...tier })),
      }))
    );
    setRangeChanges([]);
    setPriceChanges([]);
    setVariantChanges([]);
    setHasUnsavedChanges(false);
    // Обновляем nextVariantId
    const maxId = externalVariants.length > 0 ? Math.max(...externalVariants.map(v => v.id)) : 0;
    setNextVariantId(maxId + 1);
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

  // Локальное изменение цены (для конкретного варианта)
  const changePrice = useCallback((variantId: number, minQty: number, newPrice: number) => {
    setLocalVariants(prev => {
      const updated = prev.map(variant => {
        if (variant.id !== variantId) return variant;

        const hasTier = variant.tiers.some(tier => tier.minQuantity === minQty);
        let updatedTiers = variant.tiers.map(tier =>
          tier.minQuantity === minQty ? { ...tier, rate: newPrice } : tier
        );

        if (!hasTier) {
          const newTier = {
            id: 0,
            serviceId: variant.serviceId,
            variantId: variant.id,
            minQuantity: minQty,
            rate: newPrice,
            isActive: true,
          };
          updatedTiers = [...updatedTiers, newTier].sort((a, b) => a.minQuantity - b.minQuantity);
        }

        return { ...variant, tiers: updatedTiers };
      });
      return updated;
    });

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

  // Локальное создание варианта
  const createVariant = useCallback((variantName: string, parameters: Record<string, any> = {}) => {
    const newVariantId = nextVariantId;
    setNextVariantId(prev => prev + 1);

    const newVariant: VariantWithTiers = {
      id: newVariantId,
      serviceId: localVariants[0]?.serviceId || 1, // Берем serviceId из первого варианта
      variantName,
      parameters,
      sortOrder: localVariants.length,
      isActive: true,
      tiers: defaultTiers().map((t) => ({
        id: 0,
        serviceId: localVariants[0]?.serviceId || 1,
        variantId: newVariantId,
        minQuantity: t.min_qty,
        rate: t.unit_price,
        isActive: true,
      })),
    };

    setLocalVariants(prev => [...prev, newVariant]);
    setVariantChanges(prev => [...prev, {
      type: 'create',
      variantId: newVariantId,
      variantName,
      parameters,
    }]);
    setHasUnsavedChanges(true);

    return newVariant;
  }, [localVariants, nextVariantId]);

  // Локальное удаление варианта
  const deleteVariant = useCallback((variantId: number) => {
    setLocalVariants(prev => prev.filter(v => v.id !== variantId));
    setVariantChanges(prev => [...prev, { type: 'delete', variantId }]);
    setHasUnsavedChanges(true);
  }, []);

  // 🆕 Локальное обновление имени варианта (для новых и существующих вариантов)
  const updateVariantName = useCallback((variantId: number, newName: string) => {
    setLocalVariants(prev => {
      const variant = prev.find(v => v.id === variantId);
      if (!variant) return prev;
      
      const oldName = variant.variantName;
      
      // Обновляем все варианты с таким именем (т.к. variantName может быть общим для группы)
      return prev.map(v => 
        v.variantName === oldName ? { ...v, variantName: newName } : v
      );
    });
    
    setVariantChanges(prev => {
      // Проверяем, есть ли уже изменение для этого варианта
      const existingChange = prev.find(c => 
        (c.type === 'create' || c.type === 'update') && c.variantId === variantId
      );
      
      if (existingChange) {
        // Обновляем существующее изменение
        return prev.map(c =>
          (c.type === 'create' || c.type === 'update') && c.variantId === variantId
            ? { ...c, variantName: newName }
            : c
        );
      } else {
        // Проверяем, является ли вариант новым
        const isNewVariant = prev.some(c => c.type === 'create' && c.variantId === variantId);
        if (isNewVariant) {
          // Для новых вариантов обновляем изменение create
          return prev.map(c =>
            c.type === 'create' && c.variantId === variantId
              ? { ...c, variantName: newName }
              : c
          );
        } else {
          // Для существующих вариантов создаем изменение update
          const variant = localVariants.find(v => v.id === variantId);
          return [...prev, {
            type: 'update' as const,
            variantId,
            variantName: newName,
            oldVariantName: variant?.variantName,
            parameters: variant?.parameters,
          }];
        }
      }
    });
  }, [localVariants]);

  // 🆕 Локальное обновление параметров варианта (для новых и существующих вариантов)
  const updateVariantParams = useCallback((variantId: number, params: Record<string, any>) => {
    setLocalVariants(prev => prev.map(v => 
      v.id === variantId ? { ...v, parameters: params } : v
    ));
    
    setVariantChanges(prev => {
      // Проверяем, есть ли уже изменение для этого варианта
      const existingChange = prev.find(c => 
        (c.type === 'create' || c.type === 'update') && c.variantId === variantId
      );
      
      if (existingChange) {
        // Обновляем существующее изменение
        return prev.map(c =>
          (c.type === 'create' || c.type === 'update') && c.variantId === variantId
            ? { ...c, parameters: params }
            : c
        );
      } else {
        // Проверяем, является ли вариант новым
        const isNewVariant = prev.some(c => c.type === 'create' && c.variantId === variantId);
        if (isNewVariant) {
          // Для новых вариантов обновляем изменение create
          return prev.map(c =>
            c.type === 'create' && c.variantId === variantId
              ? { ...c, parameters: params }
              : c
          );
        } else {
          // Для существующих вариантов создаем изменение update
          const variant = localVariants.find(v => v.id === variantId);
          return [...prev, {
            type: 'update' as const,
            variantId,
            variantName: variant?.variantName,
            parameters: params,
          }];
        }
      }
    });
  }, [localVariants]);

  // Сохранение: один вызов onSaveChanges(pending) применяет все изменения
  const saveChanges = useCallback(async () => {
    const pending: PendingChanges = { rangeChanges, priceChanges, variantChanges };
    if (pending.rangeChanges.length === 0 && pending.priceChanges.length === 0 && pending.variantChanges.length === 0) {
      return;
    }

    try {
      await onSaveChanges(pending);
      setRangeChanges([]);
      setPriceChanges([]);
      setVariantChanges([]);
      setHasUnsavedChanges(false);
    } catch (error) {
      throw error;
    }
  }, [rangeChanges, priceChanges, variantChanges, onSaveChanges]);

  // Отмена изменений
  const cancelChanges = useCallback(() => {
    setLocalVariants(initialVariants);
    setRangeChanges([]);
    setPriceChanges([]);
    setVariantChanges([]);
    setHasUnsavedChanges(false);
  }, [initialVariants]);

  const pendingChanges: PendingChanges = useMemo(
    () => ({ rangeChanges, priceChanges, variantChanges }),
    [rangeChanges, priceChanges, variantChanges]
  );

  return {
    localVariants,
    hasUnsavedChanges,
    pendingChanges,

    // Функции для локальных изменений
    addRangeBoundary,
    editRangeBoundary,
    removeRange,
    changePrice,
    createVariant,
    deleteVariant,
    updateVariantName, // 🆕
    updateVariantParams, // 🆕

    // Функции для сохранения/отмены
    saveChanges,
    cancelChanges,
    syncWithExternal,
  };
}