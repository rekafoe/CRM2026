import { resolveTemplatePrintTierQuantity } from '../modules/pricing/utils/resolveTemplatePrintTierQuantity';

describe('resolveTemplatePrintTierQuantity', () => {
  it('ignores cart tierSheetsOverride when fixed_unit_prices is on', () => {
    expect(
      resolveTemplatePrintTierQuantity({
        fixedUnitPrices: true,
        quantity: 1,
        tierSheetsOverride: 100,
        usePagesMultiplier: false,
        multipageTierPrintUnits: 1,
        isRollPrint: true,
        isMaterialMeterBased: true,
        sheetTierQuantity: 1,
      }),
    ).toBe(1);
  });

  it('uses group override for ordinary sheet products', () => {
    expect(
      resolveTemplatePrintTierQuantity({
        fixedUnitPrices: false,
        quantity: 1,
        tierSheetsOverride: 100,
        usePagesMultiplier: false,
        multipageTierPrintUnits: 1,
        isRollPrint: false,
        isMaterialMeterBased: false,
        sheetTierQuantity: 1,
      }),
    ).toBe(100);
  });

  it('uses line quantity for roll print without override', () => {
    expect(
      resolveTemplatePrintTierQuantity({
        fixedUnitPrices: false,
        quantity: 7,
        tierSheetsOverride: null,
        usePagesMultiplier: false,
        multipageTierPrintUnits: 1,
        isRollPrint: true,
        isMaterialMeterBased: false,
        sheetTierQuantity: 99,
      }),
    ).toBe(7);
  });
});
