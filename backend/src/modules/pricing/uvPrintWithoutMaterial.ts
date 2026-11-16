/**
 * Явная печать УФ без листа/носителя.
 * Флаг действует только для шаблона flatbed_m2. Остальные типы печати его игнорируют.
 * На публичном calculate / website reprice клиентский флаг снимаем — иначе substrate $0.
 * CRM-калькулятор (JWT) и сохранённые staff-позиции могут передавать флаг дальше.
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

/** Убрать клиентский print_without_material из конфига расчёта / params сайта. */
export function stripClientPrintWithoutMaterial<T extends Record<string, unknown>>(
  input: T | null | undefined,
): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return (input ?? {}) as T;
  }
  const next: Record<string, unknown> = { ...input };
  delete next.print_without_material;
  if (next.specifications && typeof next.specifications === 'object' && !Array.isArray(next.specifications)) {
    const specs = { ...(next.specifications as Record<string, unknown>) };
    delete specs.print_without_material;
    next.specifications = specs;
  }
  if (next.configuration && typeof next.configuration === 'object' && !Array.isArray(next.configuration)) {
    const nested = { ...(next.configuration as Record<string, unknown>) };
    delete nested.print_without_material;
    next.configuration = nested;
  }
  return next as T;
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
