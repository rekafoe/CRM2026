/**
 * Упрощённый конфиг по типам продукта.
 * Если у продукта есть types + typeConfigs, возвращаем конфиг выбранного типа;
 * иначе — legacy sizes/pages из корня.
 * Для подтипов размеры возвращаются с уже подставленными эффективными allowed_material_ids
 * (общие типа или свои размера по флагу use_own_materials).
 */
export interface EffectiveSimplifiedConfig {
  sizes: Array<{ id: string; label?: string; width_mm: number; height_mm: number; [key: string]: any }>;
  pages?: {
    options?: number[];
    default?: number;
    allowCustom?: boolean;
    min?: number;
    max?: number;
    step?: number;
  };
}

/**
 * Эффективный список id материалов для размера подтипа:
 * свои (use_own_materials) или общие типа (common_allowed_material_ids).
 * Экспорт для калькулятора: при смене подтипа не подставлять initial.material_id вне этого списка.
 */
export function getEffectiveAllowedMaterialIds(
  typeConfig: { common_allowed_material_ids?: number[] } | null | undefined,
  size: { use_own_materials?: boolean; allowed_material_ids?: number[] } | null | undefined
): number[] {
  if (!size) return [];
  const common = typeConfig?.common_allowed_material_ids;
  if (size.use_own_materials === true) return size.allowed_material_ids ?? [];
  if (size.use_own_materials === false) return common ?? [];
  return common != null && common.length > 0 ? common : (size.allowed_material_ids ?? []);
}

/**
 * ID услуг (post_processing_services), явно заданные для подтипа:
 * `sizes[].finishing[].service_id` и `initial.operations`.
 * В схеме API операции продукта — объединение по всем подтипам; без этой выборки
 * в калькулятор подмешиваются чужие is_default и остаются лишние чекбоксы.
 */
export function collectAllowedOperationIdsForTypeConfig(
  cfg: { sizes?: any[]; initial?: { operations?: any[] } } | null | undefined
): Set<number> {
  const ids = new Set<number>();
  if (!cfg || typeof cfg !== 'object') return ids;
  const sizes = Array.isArray(cfg.sizes) ? cfg.sizes : [];
  for (const size of sizes) {
    const fin = Array.isArray(size?.finishing) ? size.finishing : [];
    for (const f of fin) {
      const sid = f?.service_id ?? f?.operation_id;
      if (sid != null && sid !== '' && Number.isFinite(Number(sid))) {
        ids.add(Number(sid));
      }
    }
  }
  const initialOps = Array.isArray(cfg.initial?.operations) ? cfg.initial.operations : [];
  for (const op of initialOps) {
    const oid = op?.operation_id ?? op?.service_id ?? op?.id;
    if (oid != null && oid !== '' && Number.isFinite(Number(oid))) {
      ids.add(Number(oid));
    }
  }
  return ids;
}

/** Строковые ключи из неизвестного значения (для JSON с шаблона). */
function filterStringKeys(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * Эффективные ключи типа цены: сначала ограничение продукта, затем пересечение с allowed_price_types подтипа (если задано).
 */
export function getEffectiveAllowedPriceTypes(params: {
  productAllowed: string[] | null | undefined;
  subtypeAllowed: string[] | null | undefined;
}): string[] {
  const product = filterStringKeys(params.productAllowed);
  const sub = filterStringKeys(params.subtypeAllowed);
  if (sub.length === 0) return product;
  if (product.length === 0) return sub;
  const subSet = new Set(sub);
  return product.filter((k) => subSet.has(k));
}

export function subtypePriceTypesMatchProduct(
  subtypeAllowed: string[] | null | undefined,
  productAllowed: string[] | null | undefined
): boolean {
  const base = filterStringKeys(productAllowed);
  const sub = filterStringKeys(subtypeAllowed);
  if (sub.length === 0) return true;
  if (base.length === 0) return false;
  return sameStringSet(orderedKeys(sub, base), base);
}

function orderedKeys(keys: string[], orderRef: string[]): string[] {
  const set = new Set(keys);
  return orderRef.filter((k) => set.has(k));
}

export function getEffectiveSimplifiedConfig(
  simplified: {
    sizes?: EffectiveSimplifiedConfig['sizes'];
    pages?: EffectiveSimplifiedConfig['pages'];
    types?: Array<{ id: number; name: string; default?: boolean }>;
    typeConfigs?: Record<string, { sizes?: any[]; pages?: any; common_allowed_material_ids?: number[] }>;
  } | null | undefined,
  selectedTypeId: number | null
): EffectiveSimplifiedConfig {
  if (!simplified) {
    return { sizes: [], pages: undefined };
  }
  if (simplified.types?.length && simplified.typeConfigs && selectedTypeId) {
    const typeConfig = simplified.typeConfigs[String(selectedTypeId)];
    const rawSizes = typeConfig?.sizes ?? [];
    const sizesWithEffectiveMaterials = rawSizes.map((s: any) => ({
      ...s,
      allowed_material_ids: getEffectiveAllowedMaterialIds(typeConfig as any, s),
    }));
    return {
      sizes: sizesWithEffectiveMaterials,
      pages: typeConfig?.pages ?? simplified.pages,
    };
  }
  return {
    sizes: simplified.sizes ?? [],
    pages: simplified.pages,
  };
}
