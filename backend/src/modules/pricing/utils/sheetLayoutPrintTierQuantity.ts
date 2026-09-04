/**
 * Тиражные ступени листовой печати в шаблоне заданы в штуках,
 * кратных раскладке: min_qty = min_sheets × itemsPerSheet
 * (см. GET /api/pricing/print-prices/derive).
 *
 * Биллинг уже идёт по ceil(qty / itemsPerSheet) листам, а ступень раньше
 * искали по сырому тиражу. Тогда 107 шт. при 54 шт/лист (2 листа) оставались
 * на тарифе 1 листа, а ровно 108 шт. переключались на тариф 2 листов —
 * итоговая цена проваливалась.
 */
export function sheetLayoutPrintTierQuantity(quantity: number, itemsPerSheet: number): number {
  const ips = Math.max(1, Math.floor(Number(itemsPerSheet) || 1));
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) return ips;
  return Math.ceil(qty / ips) * ips;
}
