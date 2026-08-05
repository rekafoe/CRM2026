/**
 * Себестоимость единицы для оценки склада и аналитики.
 * Приоритет: purchase_price → sheet_price_single (legacy) → 0.
 */
export function resolveMaterialPurchasePrice(material: {
  purchase_price?: number | null
  sheet_price_single?: number | null
  price?: number | null
}): number {
  const value = material.purchase_price ?? material.sheet_price_single ?? material.price ?? 0
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

/** SQL-выражение себестоимости единицы материала (alias таблицы m). */
export const MATERIAL_PURCHASE_PRICE_SQL =
  'COALESCE(m.purchase_price, m.sheet_price_single, 0)'
