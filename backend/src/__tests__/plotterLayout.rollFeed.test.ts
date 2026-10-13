import {
  computeOptimizedRollFeedMeters,
  productPlotterRollFeedMeters,
} from '../modules/pricing/services/plotterLayout';

describe('computeOptimizedRollFeedMeters', () => {
  it('chooses best orientation and minimizes feed length', () => {
    const result = computeOptimizedRollFeedMeters({
      rollWidthMm: 610,
      trimMm: { width: 300, height: 500 },
      bleedMm: 0,
      quantity: 10,
      margins: { edgeMm: 0, gapMm: 0 },
    });

    expect(result).not.toBeNull();
    expect(result?.orientation).toBe('normal');
    expect(result?.cols).toBe(2);
    expect(result?.rowsFeed).toBe(5);
    expect(result?.feedMeters).toBeCloseTo(2.5, 4);
  });

  it('uses rotated orientation when it gives shorter feed', () => {
    const result = computeOptimizedRollFeedMeters({
      rollWidthMm: 610,
      trimMm: { width: 450, height: 250 },
      bleedMm: 0,
      quantity: 10,
      margins: { edgeMm: 0, gapMm: 0 },
    });

    expect(result).not.toBeNull();
    expect(result?.orientation).toBe('rotated');
    expect(result?.cols).toBe(2);
    expect(result?.rowsFeed).toBe(5);
    expect(result?.feedMeters).toBeCloseTo(2.25, 4);
  });
});

describe('productPlotterRollFeedMeters', () => {
  it('fits A4 stickers across a 630 mm roll instead of billing the long side of each piece', () => {
    const feed = productPlotterRollFeedMeters({
      rollWidthMm: 630,
      trimMm: { width: 210, height: 297 },
      bleedMm: 0,
      quantity: 20,
    });
    // 2 шт. поперёк (297 мм), подача 210 мм, поля рулона 10 мм и зазор 2 мм.
    // Длинная сторона × тираж дала бы 5.94 м.
    expect(feed).toBeCloseTo(2.138, 3);
    expect(feed).not.toBeCloseTo(5.94, 2);
  });

  it('returns null when the roll width is missing or the piece does not fit', () => {
    expect(
      productPlotterRollFeedMeters({
        rollWidthMm: null,
        trimMm: { width: 210, height: 297 },
        quantity: 20,
      })
    ).toBeNull();
    expect(
      productPlotterRollFeedMeters({
        rollWidthMm: 100,
        trimMm: { width: 210, height: 297 },
        quantity: 4,
      })
    ).toBeNull();
  });
});
