import { PricingService, ServiceCategory } from '../../../../types/pricing';

/** Категория по умолчанию для вкладки ШФП */
export const WIDE_FORMAT_CATEGORY_NAME = 'ШФП послепечатка';

const WIDE_FORMAT_CATEGORY_RE = /шфп|широкоформат/i;

export function isWideFormatCategoryName(name?: string | null): boolean {
  if (!name) return false;
  return WIDE_FORMAT_CATEGORY_RE.test(name.trim());
}

export function findWideFormatCategory(categories: ServiceCategory[]): ServiceCategory | undefined {
  return categories.find(
    (c) => c.name === WIDE_FORMAT_CATEGORY_NAME || isWideFormatCategoryName(c.name)
  );
}

/**
 * Услуга относится к ШФП-послепечатке:
 * — категория «ШФП…» / «широкоформат…»
 * — или единица тарифа per_m2 (рулонная площадь)
 * — или ламинация за пог. м подачи (per_meter + roll_feed)
 */
export function isWideFormatService(service: PricingService): boolean {
  const pu = String(service.priceUnit || service.unit || '').toLowerCase();
  const op = String(service.operationType || '').toLowerCase();
  if (pu === 'per_m2') return true;
  if (op === 'laminate' && pu === 'per_meter') return true;
  if (isWideFormatCategoryName(service.categoryName)) return true;
  return false;
}

export function isBindingService(service: PricingService): boolean {
  return (service.operationType ?? service.type ?? '').toLowerCase() === 'bind';
}
