/** Единица «м» на складе — погонные метры (рулон); цена в БД та же, смысл — за пог. м. */

export function materialPriceFieldLabel(unit?: string | null): string {
  return unit === 'м' ? 'Цена за пог. метр (BYN) *' : 'Цена за единицу (BYN) *'
}

export function materialPriceSecondaryLabel(unit?: string | null): string {
  return unit === 'м' ? 'за пог. м' : 'за единицу'
}
