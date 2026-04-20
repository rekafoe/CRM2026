import { VariantWithTiers, GroupedVariants, VariantsByType } from './ServiceVariantsTable.types';

/** Ключ Map для связи родитель→дети (id из БД и из JSON могут отличаться number/string). */
export function variantParentMapKey(id: unknown): string {
  if (id === null || id === undefined) return '';
  const n = Number(id);
  return Number.isFinite(n) ? String(n) : String(id);
}

/**
 * Определяет уровень вложенности варианта
 */
export function getVariantLevel(variant: VariantWithTiers): number {
  const params = variant.parameters || {};
  
  // Уровень 2: есть parentVariantId (внучатый вариант)
  if (params.parentVariantId) {
    return 2;
  }
  
  // Уровень 1: есть непустые type или density (дочерний вариант)
  if ((params.type && params.type.trim()) || (params.density && params.density.trim())) {
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

  const ensure = (typeName: string): GroupedVariants => {
    if (!grouped[typeName]) {
      grouped[typeName] = {
        level0: [],
        level1: new Map(),
        level2: new Map(),
      };
    }
    return grouped[typeName];
  };

  // Сначала только корни (0), иначе дочерние строки при раннем порядке в массиве терялись
  variants.forEach((variant) => {
    if (getVariantLevel(variant) !== 0) return;
    ensure(variant.variantName).level0.push(variant);
  });

  variants.forEach((variant) => {
    if (getVariantLevel(variant) !== 1) return;
    const typeName = variant.variantName;
    const g = ensure(typeName);
    const parentLevel0 = g.level0[0];
    if (!parentLevel0) return;
    const pk = variantParentMapKey(parentLevel0.id);
    if (!g.level1.has(pk)) g.level1.set(pk, []);
    g.level1.get(pk)!.push(variant);
  });

  variants.forEach((variant) => {
    if (getVariantLevel(variant) !== 2) return;
    const typeName = variant.variantName;
    const g = ensure(typeName);
    const parentVariantId = variant.parameters?.parentVariantId;
    if (parentVariantId === null || parentVariantId === undefined || parentVariantId === '') return;
    const pk = variantParentMapKey(parentVariantId);
    if (!g.level2.has(pk)) g.level2.set(pk, []);
    g.level2.get(pk)!.push(variant);
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
