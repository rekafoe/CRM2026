/**
 * Цепочка как на бэкенде (SimplifiedPricingService):
 * запрос bleed_mm > default_bleed_mm > prepress.bleedMm
 */
export function resolveBleedMmForCalculateRequest(
  specs: { bleed_mm?: number },
  simplified?: {
    default_bleed_mm?: number;
    prepress?: { bleedMm?: number };
  } | null,
): number | undefined {
  if (specs.bleed_mm != null && Number.isFinite(Number(specs.bleed_mm))) {
    return Math.max(0, Number(specs.bleed_mm));
  }
  if (!simplified) return undefined;
  if (simplified.default_bleed_mm != null && Number.isFinite(Number(simplified.default_bleed_mm))) {
    return Math.max(0, Number(simplified.default_bleed_mm));
  }
  if (simplified.prepress?.bleedMm != null && Number.isFinite(Number(simplified.prepress.bleedMm))) {
    return Math.max(0, Number(simplified.prepress.bleedMm));
  }
  return undefined;
}
