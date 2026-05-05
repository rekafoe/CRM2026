import { LayoutCalculationService } from '../modules/pricing/services/layoutCalculationService';

describe('LayoutCalculationService bleed', () => {
  const sheet = { width: 320, height: 450 };

  it('without bleed matches historical cell size', () => {
    const trim = { width: 100, height: 200 };
    const a = LayoutCalculationService.calculateLayout(trim, sheet, 5, 2, 0);
    const b = LayoutCalculationService.calculateLayout(trim, sheet, 5, 2);
    expect(a.itemsPerSheet).toBe(b.itemsPerSheet);
    expect(a.cutsPerSheet).toBe(b.cutsPerSheet);
  });

  it('bleed reduces items per sheet vs no bleed', () => {
    const trim = { width: 90, height: 50 };
    const noBleed = LayoutCalculationService.calculateLayout(trim, sheet, 5, 2, 0);
    const withBleed = LayoutCalculationService.calculateLayout(trim, sheet, 5, 2, 3);
    expect(withBleed.itemsPerSheet).toBeLessThanOrEqual(noBleed.itemsPerSheet);
  });

  it('findOptimalSheetSize passes bleed to inner calculateLayout', () => {
    const trim = { width: 55, height: 85 };
    const r = LayoutCalculationService.findOptimalSheetSize(trim, 5, 2, 2);
    expect(r.fitsOnSheet).toBe(true);
    expect(r.itemsPerSheet).toBeGreaterThan(0);
  });
});
