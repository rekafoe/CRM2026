export type PriceType = 'standard' | 'urgent' | 'online' | 'promo' | 'special';

const baseDaysMap: Record<PriceType, number> = {
  standard: 3,
  urgent: 1,
  online: 3,
  promo: 7,
  special: 7,
};

export function getProductionDaysByPriceType(priceType: PriceType): number {
  return baseDaysMap[priceType] ?? 3;
}

export function getProductionTimeLabel(priceType: PriceType): string {
  const days = getProductionDaysByPriceType(priceType);
  return getProductionTimeLabelFromDays(days);
}

export function getProductionTimeLabelFromDays(days: number): string {
  if (days === 1) return '1 день';
  if (days >= 2 && days <= 4) return `${days} дня`;
  return `${days} дней`;
}


