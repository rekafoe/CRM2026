import { computeOptimizedRollFeedMeters } from '../modules/pricing/services/plotterLayout';

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
