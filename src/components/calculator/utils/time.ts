export type PriceType = 'standard' | 'urgent' | 'superUrgent' | 'online' | 'promo' | 'express';

const baseDaysMap: Record<PriceType, number> = {
  standard: 3,
  urgent: 1,
  superUrgent: 1,
  online: 3,
  promo: 7,
  express: 1
};

export function getProductionDaysByPriceType(priceType: PriceType): number {
  return baseDaysMap[priceType] ?? 3;
}

export function getProductionTimeLabel(priceType: PriceType): string {
  const days = getProductionDaysByPriceType(priceType);
  return `${days} ${days === 1 ? 'день' : 'дня'}`;
}


