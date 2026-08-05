/** Единица «м» на складе — погонные метры (рулон); цена в БД та же, смысл — за пог. м. */

export function materialPriceFieldLabel(unit?: string | null): string {
  return unit === 'м' ? 'Отпускная цена за пог. метр' : 'Отпускная цена за единицу'
}

export function materialPurchasePriceFieldLabel(unit?: string | null): string {
  return unit === 'м' ? 'Закупочная цена за пог. метр' : 'Закупочная цена за единицу'
}

export function materialPriceSecondaryLabel(unit?: string | null): string {
  return unit === 'м' ? 'закуп. / пог. м' : 'закуп. / ед.'
}

export function materialSellPriceSecondaryLabel(unit?: string | null): string {
  return unit === 'м' ? 'отпуск. / пог. м' : 'отпуск. / ед.'
}

/** Себестоимость для оценки склада: закупка → отпускная (legacy) → 0 */
export function resolveMaterialPurchasePrice(material: {
  purchase_price?: number | null
  sheet_price_single?: number | null
  price?: number | null
}): number {
  const value = material.purchase_price ?? material.sheet_price_single ?? material.price ?? 0
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}
