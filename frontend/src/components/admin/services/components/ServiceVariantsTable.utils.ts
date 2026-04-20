import { getParentVariantId } from '../../../../utils/serviceVariantParent';
import { VariantWithTiers, GroupedVariants, VariantsByType } from './ServiceVariantsTable.types';

/** Ключ Map для связи родитель→дети (id из БД и из JSON могут отличаться number/string). */
export function variantParentMapKey(id: unknown): string {
  if (id === null || id === undefined) return '';
  const n = Number(id);
  return Number.isFinite(n) ? String(n) : String(id);
}

function hasParentVariantId(v: VariantWithTiers): boolean {
  const id = getParentVariantId(v);
  return id !== null && id !== undefined && id !== '';
}

/** Непустые type/density — признак дочернего варианта относительно корня группы. */
function hasNonEmptyTypeOrDensity(v: VariantWithTiers): boolean {
  const p = v.parameters || {};
  const t = typeof p.type === 'string' ? p.type.trim() : '';
  const d = typeof p.density === 'string' ? p.density.trim() : '';
  return Boolean(t || d);
}

/**
 * Один корень на группу (variantName): сначала варианты без parent и без type/density,
 * иначе — самый ранний по id среди вариантов без parent (чтобы не пропадала таблица).
 */
function pickRootForGroup(group: VariantWithTiers[]): VariantWithTiers | undefined {
  const noParent = group.filter((v) => !hasParentVariantId(v));
  if (noParent.length === 0) return undefined;
  const explicitRoots = noParent.filter((v) => !hasNonEmptyTypeOrDensity(v));
  const pickMinId = (list: VariantWithTiers[]) =>
    [...list].sort((a, b) => Number(a.id) - Number(b.id))[0];
  if (explicitRoots.length > 0) return pickMinId(explicitRoots);
  return pickMinId(noParent);
}

/**
 * Группирует варианты по типам и уровням
 */
export function groupVariantsByType(variants: VariantWithTiers[]): VariantsByType {
  const byName = new Map<string, VariantWithTiers[]>();
  for (const v of variants) {
    const name = v.variantName;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(v);
  }

  const grouped: VariantsByType = {};

  for (const [typeName, group] of byName) {
    const root = pickRootForGroup(group);
    const level0: VariantWithTiers[] = root ? [root] : [];
    const level1 = new Map<string, VariantWithTiers[]>();
    const level2 = new Map<string, VariantWithTiers[]>();

    if (root) {
      const pkRoot = variantParentMapKey(root.id);
      const siblings = group
        .filter((v) => !hasParentVariantId(v) && v.id !== root.id)
        .sort((a, b) => Number(a.id) - Number(b.id));
      if (siblings.length > 0) {
        level1.set(pkRoot, siblings);
      }
    }

    for (const v of group) {
      if (!hasParentVariantId(v)) continue;
      const parentVariantId = getParentVariantId(v);
      const pk = variantParentMapKey(parentVariantId);
      if (!level2.has(pk)) level2.set(pk, []);
      level2.get(pk)!.push(v);
    }

    for (const [, arr] of level2) {
      arr.sort((a, b) => Number(a.id) - Number(b.id));
    }

    grouped[typeName] = { level0, level1, level2 };
  }

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
