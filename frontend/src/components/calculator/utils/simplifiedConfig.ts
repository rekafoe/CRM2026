/**
 * Упрощённый конфиг по типам продукта.
 * Если у продукта есть types + typeConfigs, возвращаем конфиг выбранного типа;
 * иначе — legacy sizes/pages из корня.
 * Для подтипов размеры возвращаются с уже подставленными эффективными allowed_material_ids
 * (общие типа или свои размера по флагу use_own_materials).
 */
export interface EffectiveSimplifiedConfig {
  sizes: Array<{ id: string; label?: string; width_mm: number; height_mm: number; [key: string]: any }>;
  pages?: { options?: number[]; default?: number };
}

/** Эффективный список материалов размера: свои (use_own_materials) или общие типа (common_allowed_material_ids). */
function getEffectiveAllowedMaterialIds(typeConfig: { common_allowed_material_ids?: number[] }, size: { use_own_materials?: boolean; allowed_material_ids?: number[] }): number[] {
  const common = typeConfig.common_allowed_material_ids;
  if (size.use_own_materials === true) return size.allowed_material_ids ?? [];
  if (size.use_own_materials === false) return common ?? [];
  return (common != null && common.length > 0) ? common : (size.allowed_material_ids ?? []);
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
      allowed_material_ids: getEffectiveAllowedMaterialIds(typeConfig, s),
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
