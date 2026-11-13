const PER_ITEM = new Set(['per_item', 'item', 'шт']);
const FLAT = new Set(['fixed', 'per_order', 'per_hour', 'hour', 'час']);
const LAYOUT = new Set(['per_sheet', 'sheet', 'лист', 'per_meter', 'per_m2', 'm2', 'м2', 'м²', 'per_cut']);

export function normalizeBindingUnit(unit: string | null | undefined): string {
  return String(unit ?? 'per_item').trim().toLowerCase();
}

export function isBindingPerItemUnit(unit: string | null | undefined): boolean {
  return PER_ITEM.has(normalizeBindingUnit(unit));
}

export function bindingUnitShortLabel(unit: string | null | undefined): string {
  const value = normalizeBindingUnit(unit);
  if (PER_ITEM.has(value)) return 'за изделие';
  if (value === 'fixed') return 'фикс.';
  if (value === 'per_order') return 'заказ';
  if (value === 'per_hour' || value === 'hour' || value === 'час') return 'час';
  if (value === 'per_sheet' || value === 'sheet' || value === 'лист') return 'лист';
  if (value === 'per_meter') return 'пог. м';
  if (value === 'per_m2' || value === 'm2' || value === 'м2' || value === 'м²') return 'м²';
  if (value === 'per_cut') return 'рез';
  return value;
}

/** Пометка в ячейке, если сохранённая единица не «за изделие». */
export function bindingUnitNote(unit: string | null | undefined): string | null {
  const value = normalizeBindingUnit(unit);
  if (PER_ITEM.has(value)) return null;
  if (FLAT.has(value)) return 'в расчёте один раз';
  if (LAYOUT.has(value)) return 'расчёт не примет';
  return 'в расчёте один раз';
}

export function bindingUnitWarning(unit: string | null | undefined): string | null {
  const value = normalizeBindingUnit(unit);
  if (PER_ITEM.has(value)) return null;
  const label = bindingUnitShortLabel(value);
  if (LAYOUT.has(value)) {
    return `Сейчас единица: ${label}. Расчёт такую единицу не принимает.`;
  }
  return `Сейчас единица: ${label}. Расчёт берёт ставку один раз, без умножения на тираж.`;
}

export function bindingQuantityRangeInvalid(minRaw: string, maxRaw: string): boolean {
  const min = Number(String(minRaw ?? '').trim());
  const maxText = String(maxRaw ?? '').trim();
  if (maxText === '') return false;
  const max = Number(maxText);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
  return min > max;
}

export function bindingRunSubtitle(
  minQuantity: number | null | undefined,
  maxQuantity: number | null | undefined,
  materialName: string | null | undefined,
): string {
  const min = minQuantity != null && Number.isFinite(Number(minQuantity)) ? Number(minQuantity) : 1;
  const max =
    maxQuantity != null && Number.isFinite(Number(maxQuantity)) ? Number(maxQuantity) : null;
  const run = max != null ? `тираж ${min}–${max}` : `тираж от ${min}`;
  const material = materialName?.trim() ? materialName.trim() : 'без материала';
  return `${run} · ${material}`;
}
