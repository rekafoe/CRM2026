/**
 * Явная печать УФ без листа/носителя.
 * Флаг действует только для шаблона flatbed_m2. Остальные типы печати его игнорируют.
 */

export function isTruthyWithoutMaterialFlag(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === '1';
}

export function isExplicitUvPrintWithoutMaterial(
  isUvFlatbedMode: boolean,
  configuration: { print_without_material?: unknown } | null | undefined,
): boolean {
  if (!isUvFlatbedMode) return false;
  return isTruthyWithoutMaterialFlag(configuration?.print_without_material);
}

/** Позиция заказа: оператор явно выбрал УФ без материала (флаг + блок uv_print). */
export function orderParamsDeclareUvPrintWithoutMaterial(params: unknown): boolean {
  if (!params || typeof params !== 'object') return false;
  const record = params as Record<string, unknown>;
  const specs =
    record.specifications && typeof record.specifications === 'object' && !Array.isArray(record.specifications)
      ? (record.specifications as Record<string, unknown>)
      : {};
  const flag = isTruthyWithoutMaterialFlag(specs.print_without_material ?? record.print_without_material);
  const uv = specs.uv_print ?? record.uv_print;
  return flag && uv != null && typeof uv === 'object';
}
