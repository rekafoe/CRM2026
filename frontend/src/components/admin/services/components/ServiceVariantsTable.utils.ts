import { VariantWithTiers, GroupedVariants, VariantsByType } from './ServiceVariantsTable.types';

/**
 * Определяет уровень вложенности варианта
 */
export function getVariantLevel(variant: VariantWithTiers): number {
  const params = variant.parameters || {};
  
  // Уровень 2: есть parentVariantId (внучатый вариант)
  if (params.parentVariantId) {
    return 2;
  }
  
  // Уровень 1: есть type или density (дочерний вариант)
  if (params.type || params.density) {
    return 1;
  }
  
  // Уровень 0: родительский вариант (тип)
  return 0;
}

/**
 * Группирует варианты по типам и уровням
 */
export function groupVariantsByType(variants: VariantWithTiers[]): VariantsByType {
  const grouped: VariantsByType = {};

  variants.forEach((variant) => {
    const level = getVariantLevel(variant);
    const typeName = variant.variantName;

    if (!grouped[typeName]) {
      grouped[typeName] = {
        level0: [],
        level1: new Map(),
        level2: new Map(),
      };
    }

    if (level === 0) {
      grouped[typeName].level0.push(variant);
    } else if (level === 1) {
      // Для уровня 1, родителем является вариант из level 0
      const parentLevel0 = grouped[typeName].level0[0];
      if (parentLevel0) {
        const parentId = parentLevel0.id;
        if (!grouped[typeName].level1.has(parentId)) {
          grouped[typeName].level1.set(parentId, []);
        }
        grouped[typeName].level1.get(parentId)!.push(variant);
      }
    } else if (level === 2) {
      // Для уровня 2, родителем является вариант из level 1
      const parentVariantId = variant.parameters?.parentVariantId;
      if (parentVariantId) {
        if (!grouped[typeName].level2.has(parentVariantId)) {
          grouped[typeName].level2.set(parentVariantId, []);
        }
        grouped[typeName].level2.get(parentVariantId)!.push(variant);
      }
    }
  });

  return grouped;
}

/**
 * Вычисляет общие диапазоны для всех вариантов
 */
export function calculateCommonRanges(
  variants: VariantWithTiers[]
): Array<{ min_qty: number; max_qty?: number; unit_price: number }> {
  const allMinQtys = new Set<number>();
  
  variants.forEach((v) => {
    v.tiers.forEach((t) => allMinQtys.add(t.minQuantity));
  });
  
  const sortedMinQtys = Array.from(allMinQtys).sort((a, b) => a - b);
  
  return sortedMinQtys.map((minQty, idx) => ({
    min_qty: minQty,
    max_qty: idx < sortedMinQtys.length - 1 ? sortedMinQtys[idx + 1] - 1 : undefined,
    unit_price: 0,
  }));
}

/**
 * Создает Map для быстрого поиска вариантов по ID
 */
export function createVariantsMap(variants: VariantWithTiers[]): Map<number, VariantWithTiers> {
  return new Map(variants.map((v) => [v.id, v]));
}

/**
 * Создает Map для быстрого поиска индексов вариантов
 */
export function createVariantsIndexMap(variants: VariantWithTiers[]): Map<number, number> {
  return new Map(variants.map((v, idx) => [v.id, idx]));
}
