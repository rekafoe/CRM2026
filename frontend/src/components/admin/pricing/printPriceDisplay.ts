import type { PrintPrice } from '../hooks/usePricingManagementState';

export type PricingTabKey =
  | 'tech'
  | 'printers'
  | 'print'
  | 'services'
  | 'markup'
  | 'discounts'
  | 'price-types';

export const PRICING_TAB_KEYS: PricingTabKey[] = [
  'tech',
  'printers',
  'print',
  'services',
  'markup',
  'discounts',
  'price-types',
];

export const PRINTERS_PRINT_TAB_URL = '/adminpanel/printers?tab=print';

export function parsePricingTab(
  raw: string | null | undefined,
  fallback: PricingTabKey,
): PricingTabKey {
  if (raw && PRICING_TAB_KEYS.includes(raw as PricingTabKey)) {
    return raw as PricingTabKey;
  }
  return fallback;
}

export function formatCounterUnit(unit: PrintPrice['counter_unit']): string {
  if (unit === 'meters') return 'Пог. метры';
  if (unit === 'm2') return 'Кв. метры (УФ)';
  return 'Листы';
}

export function formatPricingMode(mode: string | undefined): string {
  if (mode === 'per_meter') return 'Пог. метр';
  if (mode === 'per_m2') return 'Кв. метр (УФ)';
  return 'За лист';
}

export function resolveTechnologyName(
  code: string,
  technologies: Array<{ code: string; name: string }>,
): string {
  return technologies.find((t) => t.code === code)?.name ?? code;
}

export function sortPrintPrices(items: PrintPrice[]): PrintPrice[] {
  return [...items].sort((a, b) => {
    const aActive = a.is_active !== 0 ? 0 : 1;
    const bActive = b.is_active !== 0 ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return String(a.technology_code).localeCompare(String(b.technology_code), 'ru');
  });
}

export function searchPlaceholderForTab(tab: PricingTabKey): string {
  switch (tab) {
    case 'print':
      return 'Технология, единица учёта, ставки…';
    case 'tech':
      return 'Код или название технологии…';
    case 'printers':
      return 'Код, название или тип печати…';
    case 'services':
      return 'Название услуги…';
    case 'markup':
      return 'Название настройки…';
    case 'discounts':
      return 'Описание скидки…';
    case 'price-types':
      return 'Тип цены…';
    default:
      return 'Поиск…';
  }
}
