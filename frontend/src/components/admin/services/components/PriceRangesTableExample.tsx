/**
 * Пример использования компонента PriceRangesTable
 * 
 * Этот файл показывает, как использовать новый компонент PriceRangesTable
 * вместо сложной логики с диапазонами в ServiceVariantsTable
 */

import React, { useState, useCallback } from 'react';
import { PriceRangesTable } from '../../../common';
import { PriceRange, PriceRangeUtils } from '../../../../hooks/usePriceRanges';
import { ServiceVariant, ServiceVolumeTier } from '../../../../types/pricing';
import {
  getServiceVariantTiers,
  createServiceVariantTier,
  updateServiceVariantTier,
  deleteServiceVariantTier,
} from '../../../../services/pricing';

interface VariantWithTiers extends ServiceVariant {
  tiers: ServiceVolumeTier[];
}

interface PriceRangesTableExampleProps {
  serviceId: number;
  variants: VariantWithTiers[];
  onVariantsChange: (variants: VariantWithTiers[]) => void;
}

/**
 * Пример компонента, использующего PriceRangesTable
 * 
 * Преимущества:
 * 1. Вся логика работы с диапазонами вынесена в переиспользуемый компонент
 * 2. Код становится проще и понятнее
 * 3. Легко тестировать и поддерживать
 * 4. Можно использовать в других местах приложения
 */
export const PriceRangesTableExample: React.FC<PriceRangesTableExampleProps> = ({
  serviceId,
  variants,
  onVariantsChange,
}) => {
  // Преобразуем tiers в формат PriceRange
  const rangeSets: PriceRange[][] = variants.map(variant =>
    variant.tiers.map(tier => ({
      minQty: tier.minQuantity,
      maxQty: undefined, // Будет вычислено автоматически
      price: tier.rate,
    }))
  );

  // Названия для колонок (имена вариантов)
  const rangeSetLabels = variants.map(v => v.variantName);

  // Обработчик изменения цены
  const handlePriceChange = useCallback(async (
    rangeSetIndex: number,
    minQty: number,
    newPrice: number
  ) => {
    const variant = variants[rangeSetIndex];
    if (!variant) return;

    // Обновляем локально
    const updatedVariants = [...variants];
    const tier = variant.tiers.find(t => t.minQuantity === minQty);

    if (tier) {
      // Обновляем существующий tier
      if (tier.id > 0) {
        await updateServiceVariantTier(serviceId, variant.id, tier.id, {
          minQuantity: tier.minQuantity,
          rate: newPrice,
        });
      }
      
      updatedVariants[rangeSetIndex] = {
        ...variant,
        tiers: variant.tiers.map(t =>
          t.minQuantity === minQty ? { ...t, rate: newPrice } : t
        ),
      };
    } else {
      // Создаем новый tier
      const created = await createServiceVariantTier(serviceId, variant.id, {
        minQuantity: minQty,
        rate: newPrice,
      });

      updatedVariants[rangeSetIndex] = {
        ...variant,
        tiers: [...variant.tiers, created].sort((a, b) => a.minQuantity - b.minQuantity),
      };
    }

    onVariantsChange(updatedVariants);
  }, [serviceId, variants, onVariantsChange]);

  // Обработчик добавления границы диапазона
  const handleAddBoundary = useCallback(async (boundary: number) => {
    const updatedVariants = await Promise.all(
      variants.map(async (variant) => {
        const currentRanges: PriceRange[] = variant.tiers.map(t => ({
          minQty: t.minQuantity,
          price: t.rate,
        }));

        const newRanges = PriceRangeUtils.addBoundary(currentRanges, boundary);
        const normalizedRanges = PriceRangeUtils.normalize(newRanges);

        // Создаем/обновляем tiers на сервере
        const updatedTiers = await Promise.all(
          normalizedRanges.map(async (range: PriceRange) => {
            const existingTier = variant.tiers.find(t => t.minQuantity === range.minQty);
            
            if (existingTier) {
              if (existingTier.rate !== range.price) {
                await updateServiceVariantTier(serviceId, variant.id, existingTier.id, {
                  minQuantity: range.minQty,
                  rate: range.price,
                });
              }
              return existingTier;
            } else {
              return await createServiceVariantTier(serviceId, variant.id, {
                minQuantity: range.minQty,
                rate: range.price,
              });
            }
          })
        );

        // Удаляем tiers, которых больше нет
        const newMinQtys = new Set(normalizedRanges.map((r: PriceRange) => r.minQty));
        for (const tier of variant.tiers) {
          if (!newMinQtys.has(tier.minQuantity)) {
            await deleteServiceVariantTier(serviceId, tier.id);
          }
        }

        return {
          ...variant,
          tiers: updatedTiers,
        };
      })
    );

    onVariantsChange(updatedVariants);
  }, [serviceId, variants, onVariantsChange]);

  // Обработчик редактирования границы
  const handleEditBoundary = useCallback(async (rangeIndex: number, newBoundary: number) => {
    // Находим общие диапазоны
    const commonRanges = PriceRangeUtils.findCommonRanges(rangeSets);
    const rangeToEdit = commonRanges[rangeIndex];
    if (!rangeToEdit) return;

    const updatedVariants = await Promise.all(
      variants.map(async (variant) => {
        const currentRanges: PriceRange[] = variant.tiers.map(t => ({
          minQty: t.minQuantity,
          price: t.rate,
        }));

        const tierIndex = currentRanges.findIndex(r => r.minQty === rangeToEdit.minQty);
        if (tierIndex === -1) return variant;

        const newRanges = PriceRangeUtils.editBoundary(currentRanges, tierIndex, newBoundary);
        const normalizedRanges = PriceRangeUtils.normalize(newRanges);

        // Обновляем tiers на сервере (аналогично handleAddBoundary)
        // ... (код обновления tiers)
        
        return variant; // TODO: реализовать обновление
      })
    );

    onVariantsChange(updatedVariants);
  }, [variants, rangeSets, onVariantsChange]);

  // Обработчик удаления диапазона
  const handleRemoveRange = useCallback(async (rangeIndex: number) => {
    const commonRanges = PriceRangeUtils.findCommonRanges(rangeSets);
    const rangeToRemove = commonRanges[rangeIndex];
    if (!rangeToRemove) return;

    const updatedVariants = await Promise.all(
      variants.map(async (variant) => {
        const currentRanges: PriceRange[] = variant.tiers.map(t => ({
          minQty: t.minQuantity,
          price: t.rate,
        }));

        const tierIndex = currentRanges.findIndex(r => r.minQty === rangeToRemove.minQty);
        if (tierIndex === -1) return variant;

        const newRanges = PriceRangeUtils.removeRange(currentRanges, tierIndex);
        const normalizedRanges = PriceRangeUtils.normalize(newRanges);

        // Обновляем tiers на сервере
        // ... (код обновления tiers)

        return variant; // TODO: реализовать обновление
      })
    );

    onVariantsChange(updatedVariants);
  }, [variants, rangeSets, onVariantsChange]);

  return (
    <PriceRangesTable
      rangeSets={rangeSets}
      rangeSetLabels={rangeSetLabels}
      onPriceChange={handlePriceChange}
      onAddBoundary={handleAddBoundary}
      onEditBoundary={handleEditBoundary}
      onRemoveRange={handleRemoveRange}
      editable={true}
      unit="шт."
    />
  );
};
