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
  return `${days} ${days === 1 ? 'день' : 'дня'}`;
}


