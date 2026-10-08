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
    expect(r.fitsOnSheet).toBe(true);
    expect(r.knifePathM).toBeGreaterThan(0);
    expect(r.sheetsNeeded).toBeGreaterThanOrEqual(1);
  });

  test('sheet turns a wide sticker so it fits', () => {
    const r = computeKnifePathMetersSheet({
      sheetMm: { width: 320, height: 450 },
      trimMm: { width: 300, height: 80 },
      bleedMm: 0,
      quantity: 3,
      margins: resolvePlotterMargins('sheet'),
    });
    expect(r.fitsOnSheet).toBe(true);
    expect(r.itemsPerBand).toBeGreaterThanOrEqual(1);
    expect(r.sheetsNeeded).toBe(1);
    expect(r.knifePathM).toBeGreaterThan(0);
  });

  test('sheet piece larger than the sheet bills perimeter and one sheet per item', () => {
    const r = computeKnifePathMetersSheet({
      sheetMm: { width: 320, height: 450 },
      trimMm: { width: 400, height: 400 },
      bleedMm: 0,
      quantity: 3,
      margins: resolvePlotterMargins('sheet'),
    });
    expect(r.fitsOnSheet).toBe(false);
    expect(r.sheetsNeeded).toBe(3);
    expect(r.knifePathM).toBeCloseTo((3 * 2 * (400 + 400)) / 1000);
  });
});
