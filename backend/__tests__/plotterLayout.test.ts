import {
  computeKnifePathMetersRoll,
  computeKnifePathMetersSheet,
  PLOTTER_DEFAULTS,
  resolvePlotterMargins,
} from '../src/modules/pricing/services/plotterLayout'

describe('plotterLayout', () => {
  test('defaults roll 10/2 sheet 15/4', () => {
    expect(resolvePlotterMargins('roll')).toEqual(PLOTTER_DEFAULTS.roll);
    expect(resolvePlotterMargins('sheet')).toEqual(PLOTTER_DEFAULTS.sheet);
  });

  test('roll 40x40 stickers qty 50 roll width 1000', () => {
    const r = computeKnifePathMetersRoll({
      rollWidthMm: 1000,
      trimMm: { width: 40, height: 40 },
      bleedMm: 0,
      quantity: 50,
      margins: resolvePlotterMargins('roll'),
    });
    expect(r.cols).toBeGreaterThan(1);
    expect(r.knifePathM).toBeGreaterThan(0);
    expect(r.rowsFeed).toBe(Math.ceil(50 / r.cols));
  });

  test('sheet SRA3-ish layout', () => {
    const r = computeKnifePathMetersSheet({
      sheetMm: { width: 320, height: 450 },
      trimMm: { width: 40, height: 40 },
      bleedMm: 0,
      quantity: 100,
      margins: resolvePlotterMargins('sheet'),
    });
    expect(r.knifePathM).toBeGreaterThan(0);
    expect(r.sheetsNeeded).toBeGreaterThanOrEqual(1);
  });
});
