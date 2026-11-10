/**
 * Выбор тиражной ступени для print_prices шаблона.
 *
 * fixed_unit_prices (холст с подрамником и т.п.): ступени — цена готовой штуки
 * по размеру. Их нельзя подменять суммарным объёмом корзины (tierSheetsOverride),
 * иначе маленький дорогой размер получает скидку от чужого крупного тиража.
 */
export function resolveTemplatePrintTierQuantity(input: {
  fixedUnitPrices: boolean;
  quantity: number;
  tierSheetsOverride?: number | null;
  usePagesMultiplier: boolean;
  multipageTierPrintUnits: number;
  isRollPrint: boolean;
  isMaterialMeterBased: boolean;
  sheetTierQuantity: number;
}): number {
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  if (input.fixedUnitPrices) {
    return quantity;
  }
  if (
    input.tierSheetsOverride != null &&
    Number.isFinite(Number(input.tierSheetsOverride)) &&
    Number(input.tierSheetsOverride) > 0
  ) {
    return Math.floor(Number(input.tierSheetsOverride));
  }
  if (input.usePagesMultiplier) {
    return Math.max(1, Math.floor(Number(input.multipageTierPrintUnits) || 1));
  }
  if (input.isRollPrint || input.isMaterialMeterBased) {
    return quantity;
  }
  return Math.max(1, Math.floor(Number(input.sheetTierQuantity) || 1));
}
