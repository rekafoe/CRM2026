/**
 * Количество услуги в упрощённом калькуляторе.
 * per_item умножается на тираж.
 * fixed / per_order / per_hour и per_cut — фиксированное количество на заказ.
 * quantity_scope на строке услуги продукта переключает это явно:
 * item — норма × тираж (как раньше price_unit=per_item, «за изделие»);
 * run — норма один раз на весь тираж.
 * Без поля формула остаётся прежней, раскладка per_sheet / per_meter / per_m2 не меняется.
 * Обязательная строка шаблона всегда входит в расчёт со своим units_per_item.
 */

const FLAT_FINISHING_UNITS = new Set(['fixed', 'per_order', 'per_hour']);

/** Как считать норму услуги внутри продукта: на весь тираж или на каждое изделие. */
export type FinishingQuantityScope = 'run' | 'item';

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

export function readFinishingQuantityScope(raw: unknown): FinishingQuantityScope | undefined {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'run' || value === 'item') return value;
  return undefined;
}

/**
 * Единицы, на которые умножается ставка услуги.
 * per_sheet / per_meter / per_m2 сюда не передавать.
 * Без quantity_scope: per_cut и fixed/per_order/per_hour — один раз, per_item — × тираж.
 */
export function resolveCountableFinishingUnits(
  priceUnit: string | null | undefined,
  quantity: number,
  unitsPerItem: number,
  quantityScope: unknown,
): number {
  const unit = String(priceUnit ?? '').trim().toLowerCase();
  const scope = readFinishingQuantityScope(quantityScope);
  const once = (): number => {
    if (isFlatFinishingPriceUnit(unit)) return flatFinishingUnits(unit, unitsPerItem) ?? 1;
    const units = Number(unitsPerItem);
    if (!Number.isFinite(units)) return 1;
    return Math.max(units, 0);
  };
  if (scope === 'run') return once();
  if (scope === 'item') {
    const units = Number(unitsPerItem);
    return quantity * (Number.isFinite(units) ? units : 1);
  }
  if (unit === 'per_cut' || isFlatFinishingPriceUnit(unit)) return once();
  const units = Number(unitsPerItem);
  return quantity * (Number.isFinite(units) ? units : 1);
}

type FinishingRow = {
  service_id: number;
  variant_id?: number;
  price_unit?: string;
  units_per_item?: number;
  quantity_scope?: unknown;
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
    const quantityScope = readFinishingQuantityScope(row.quantity_scope);
    const index = next.findIndex((item) => Number(item.service_id) === serviceId);
    if (index === -1) {
      next.push({
        service_id: serviceId,
        ...(variantId != null ? { variant_id: variantId } : {}),
        ...(row.price_unit ? { price_unit: row.price_unit } : {}),
        ...(units != null ? { units_per_item: units } : {}),
        ...(quantityScope ? { quantity_scope: quantityScope } : {}),
      } as T);
      continue;
    }
    const prev = next[index];
    next[index] = {
      ...prev,
      ...(variantId != null ? { variant_id: variantId } : {}),
      ...(units != null ? { units_per_item: units } : {}),
      ...(quantityScope ? { quantity_scope: quantityScope } : {}),
    };
  }

  return next;
}
