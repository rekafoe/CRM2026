import type { ServiceVariant } from '../types/pricing';

/**
 * Колонка parentVariantId с сервера имеет приоритет над parameters.parentVariantId.
 */
export function getParentVariantId(
  v: Pick<ServiceVariant, 'parentVariantId' | 'parameters'>
): number | string | null | undefined {
  const top = v.parentVariantId;
  if (top !== null && top !== undefined) return top;
  return v.parameters?.parentVariantId;
}

/**
 * Значение для тел PUT/POST: синхронизация колонки parent_variant_id с полем в parameters.
 * undefined — ключа parentVariantId в объекте нет, колонку в запросе не трогаем.
 */
export function parentVariantIdForApiPayload(params: Record<string, any>): number | null | undefined {
  if (!('parentVariantId' in params)) return undefined;
  const val = params.parentVariantId;
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Для PATCH-операций по варианту, когда нужно передать актуальный родитель вместе с другими полями. */
export function variantParentVariantIdForPayload(
  v: Pick<ServiceVariant, 'parentVariantId' | 'parameters'>
): number | null | undefined {
  if (v.parentVariantId !== undefined && v.parentVariantId !== null) return v.parentVariantId;
  return parentVariantIdForApiPayload(v.parameters ?? {});
}
