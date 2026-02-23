/**
 * Упрощённый конфиг по типам продукта.
 * Если у продукта есть types + typeConfigs, возвращаем конфиг выбранного типа;
 * иначе — legacy sizes/pages из корня.
 */
export interface EffectiveSimplifiedConfig {
  sizes: Array<{ id: string; label?: string; width_mm: number; height_mm: number; [key: string]: any }>;
  pages?: { options?: number[]; default?: number };
}

export function getEffectiveSimplifiedConfig(
  simplified: {
    sizes?: EffectiveSimplifiedConfig['sizes'];
    pages?: EffectiveSimplifiedConfig['pages'];
    types?: Array<{ id: number; name: string; default?: boolean }>;
    typeConfigs?: Record<string, { sizes?: any[]; pages?: any }>;
  } | null | undefined,
  selectedTypeId: number | null
): EffectiveSimplifiedConfig {
  if (!simplified) {
    return { sizes: [], pages: undefined };
  }
  if (simplified.types?.length && simplified.typeConfigs && selectedTypeId) {
    const typeConfig = simplified.typeConfigs[String(selectedTypeId)];
    return {
      sizes: typeConfig?.sizes ?? [],
      pages: typeConfig?.pages ?? simplified.pages,
    };
  }
  return {
    sizes: simplified.sizes ?? [],
    pages: simplified.pages,
  };
}
