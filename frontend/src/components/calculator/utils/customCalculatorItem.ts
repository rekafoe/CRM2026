/** Позиция произвольного калькулятора: type, флаг или productType. params может прийти строкой JSON. */

export function readItemParams(raw: unknown): Record<string, any> {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  return {};
}

export function isCustomCalculatorItem(
  item: { type?: string | null; params?: unknown } | null | undefined,
): boolean {
  const params = readItemParams(item?.params);
  if (params.customProduct === true || params.customProduct === 'true') return true;
  if (String(params.productType ?? '').trim().toLowerCase() === 'custom') return true;
  if (String(item?.type ?? '').trim().toLowerCase() === 'custom') return true;
  return Number(params.productId) === -1000;
}
