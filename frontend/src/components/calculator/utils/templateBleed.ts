/**
 * Дозаливка для запроса calculate — только из шаблона продукта.
 * Клиентский specs.bleed_mm не используем: бэкенд его тоже игнорирует
 * (иначе public/website мог обнулить раскладку и занизить цену).
 */
export function resolveBleedMmForCalculateRequest(
  _specs: { bleed_mm?: number },
  simplified?: {
    default_bleed_mm?: number;
    prepress?: { bleedMm?: number };
  } | null,
): number | undefined {
  if (!simplified) return undefined;
  if (simplified.default_bleed_mm != null && Number.isFinite(Number(simplified.default_bleed_mm))) {
    return Math.max(0, Number(simplified.default_bleed_mm));
  }
  if (simplified.prepress?.bleedMm != null && Number.isFinite(Number(simplified.prepress.bleedMm))) {
    return Math.max(0, Number(simplified.prepress.bleedMm));
  }
  return undefined;
}
