/**
 * Количество услуги в упрощённом калькуляторе.
 * per_item умножается на тираж.
 * fixed / per_order / per_hour и per_cut — фиксированное количество на заказ.
 * Обязательная строка шаблона всегда входит в расчёт со своим units_per_item.
 */

const FLAT_FINISHING_UNITS = new Set(['fixed', 'per_order', 'per_hour']);

export function isTemplateFinishingRequired(row: { is_required?: unknown } | null | undefined): boolean {
  const value = row?.is_required;
  return value === true || value === 1 || value === '1';
}

export function isFlatFinishingPriceUnit(priceUnit: string | null | undefined): boolean {
  return FLAT_FINISHING_UNITS.has(String(priceUnit ?? '').trim().toLowerCase());
}

/** Сколько единиц взять в счёт один раз. null — услуга считается от тиража или раскладки. 0 остаётся нулём. */
export function flatFinishingUnits(priceUnit: string | null | undefined, unitsPerItem: unknown): number | null {
  if (!isFlatFinishingPriceUnit(priceUnit)) return null;
  if (unitsPerItem === undefined || unitsPerItem === null || unitsPerItem === '') return 1;
  const units = Number(unitsPerItem);
  if (!Number.isFinite(units) || units < 0) return 1;
  return units;
}

type FinishingRow = {
  service_id: number;
  variant_id?: number;
  price_unit?: string;
  units_per_item?: number;
  is_required?: unknown;
};

function templateUnits(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const units = Number(raw);
  if (!Number.isFinite(units) || units < 0) return undefined;
  return units;
}

/**
 * Услуги размера: свои, общие типа или старый список размера,
 * пока флаг не задан и общего списка ещё нет.
 */
export function getEffectiveFinishing<T>(
  typeConfig: { common_finishing?: T[] } | null | undefined,
  size: { use_own_finishing?: boolean; finishing?: T[] } | null | undefined,
): T[] {
  if (!size) return [];
  const common = typeConfig?.common_finishing;
  if (size.use_own_finishing === true) return size.finishing ?? [];
  if (size.use_own_finishing === false) return common ?? [];
  return common != null && common.length > 0 ? common : (size.finishing ?? []);
}

function variantIdOf(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : undefined;
}

/**
 * Добавляет обязательные услуги размера и подставляет их количество.
 * Отрицательные id плоттера не трогаем: их в шаблон продукта не кладут.
 */
export function enforceRequiredFinishing<T extends FinishingRow>(
  chosen: T[] | null | undefined,
  template: Array<FinishingRow> | null | undefined,
): T[] {
  const next = Array.isArray(chosen) ? [...chosen] : [];
  if (!Array.isArray(template) || template.length === 0) return next;

  for (const row of template) {
    if (!isTemplateFinishingRequired(row)) continue;
    const serviceId = Number(row.service_id);
    if (!Number.isFinite(serviceId) || serviceId <= 0) continue;
    const variantId = variantIdOf(row.variant_id);
    const units = templateUnits(row.units_per_item);
    const index = next.findIndex((item) => Number(item.service_id) === serviceId);
    if (index === -1) {
      next.push({
        service_id: serviceId,
        ...(variantId != null ? { variant_id: variantId } : {}),
        ...(row.price_unit ? { price_unit: row.price_unit } : {}),
        ...(units != null ? { units_per_item: units } : {}),
      } as T);
      continue;
    }
    const prev = next[index];
    const patched: FinishingRow = {
      ...prev,
      ...(variantId != null ? { variant_id: variantId } : {}),
    };
    if (units != null) {
      // Шаблон задал норму (в том числе 0) — она источник истины.
      patched.units_per_item = units;
    } else {
      // В шаблоне нормы нет: клиентский 0 / мусор не должен обнулить обязательную услугу
      // (в калькуляторе сработает units_per_item ?? 1).
      const clientUnits = templateUnits(prev.units_per_item);
      if (clientUnits == null || clientUnits <= 0) {
        delete patched.units_per_item;
      }
    }
    next[index] = patched as T;
  }

  return next;
}
