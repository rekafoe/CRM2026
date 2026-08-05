/**
 * Подпись варианта услуги для калькулятора / сайта.
 * Если к варианту привязан рулон — дописываем ширину «(1270 мм)».
 */

export function readRollWidthMm(variant: {
  roll_width_mm?: number | null;
  material_sheet_width?: number | null;
  parameters?: Record<string, unknown> | null;
}): number | null {
  const fromTop = Number(variant.roll_width_mm ?? variant.material_sheet_width ?? 0);
  if (Number.isFinite(fromTop) && fromTop > 0) return fromTop;
  const params = variant.parameters || {};
  const fromParams = Number(
    (params as any).roll_width_mm ?? (params as any).rollWidthMm ?? (params as any).sheet_width ?? 0
  );
  return Number.isFinite(fromParams) && fromParams > 0 ? fromParams : null;
}

export function formatServiceVariantDisplayLabel(
  variant: {
    variantName?: string;
    label?: string;
    parameters?: Record<string, unknown> | null;
    roll_width_mm?: number | null;
    material_sheet_width?: number | null;
  },
  baseLabel?: string
): string {
  const params = variant.parameters || {};
  const base = String(
    baseLabel ??
      variant.label ??
      (params as any).subType ??
      (params as any).type ??
      (params as any).density ??
      variant.variantName ??
      ''
  ).trim();
  const widthMm = readRollWidthMm(variant);
  if (widthMm == null) return base;
  const rounded = Math.round(widthMm);
  if (
    base.includes(`${rounded}`) ||
    base.includes(String(widthMm)) ||
    /мм\s*$/i.test(base)
  ) {
    return base;
  }
  return base ? `${base} (${rounded} мм)` : `${rounded} мм`;
}
