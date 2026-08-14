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
 * Один корень на группу (variantName): только явный заголовок без parent и без type/density.
 * Плоские peers с type/density без заголовка не получают синтетический корень —
 * иначе backend/clearNonLeaf стирает цены у первого варианта группы.
 */
function pickRootForGroup(group: VariantWithTiers[]): VariantWithTiers | undefined {
  const noParent = group.filter((v) => !hasParentVariantId(v));
  if (noParent.length === 0) return undefined;
  const explicitRoots = noParent.filter((v) => !hasNonEmptyTypeOrDensity(v));
  if (explicitRoots.length === 0) return undefined;
  return [...explicitRoots].sort((a, b) => Number(a.id) - Number(b.id))[0];
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
    } else {
      // Legacy flat peers: каждый вариант — лист. Рендерим через level0+level1,
      // чтобы ServiceVariantsGrid (требует level0[0]) не скрыл группу.
      const peers = group
        .filter((v) => !hasParentVariantId(v))
        .sort((a, b) => Number(a.id) - Number(b.id));
      if (peers.length > 0) {
        level0.push(peers[0]);
        const rest = peers.slice(1);
        if (rest.length > 0) {
          level1.set(variantParentMapKey(peers[0].id), rest);
        }
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

/** ID вариантов, которые являются последним уровнем и поэтому могут хранить цену. */
export function collectPricingLeafVariantIds(variants: VariantWithTiers[]): Set<number> {
  const leafIds = new Set<number>();
  const grouped = groupVariantsByType(variants);

  for (const group of Object.values(grouped)) {
    const level0 = group.level0[0];
    const level1Variants = [...group.level1.values()].flat();
    const level2Variants = [...group.level2.values()].flat();
    const totalVariants = group.level0.length + level1Variants.length + level2Variants.length;

    if (level0 && totalVariants === 1) {
      leafIds.add(Number(level0.id));
    } else if (level0 && hasNonEmptyTypeOrDensity(level0) && level2Variants.length === 0) {
      // Синтетический «корень» среди flat typed peers — тоже лист с ценой.
      leafIds.add(Number(level0.id));
    }
    for (const variant of level1Variants) {
      const children = group.level2.get(variantParentMapKey(variant.id)) || [];
      if (children.length === 0) leafIds.add(Number(variant.id));
    }
    for (const variant of level2Variants) {
      leafIds.add(Number(variant.id));
    }
  }

  return leafIds;
}

/**
 * Вычисляет общие диапазоны для всех вариантов
 */
export function calculateCommonRanges(
  variants: VariantWithTiers[]
): Array<{ min_qty: number; max_qty?: number; unit_price: number }> {
  const allMinQtys = new Set<number>();
  const leafIds = collectPricingLeafVariantIds(variants);
  
  variants.forEach((v) => {
    if (!leafIds.has(Number(v.id))) return;
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
