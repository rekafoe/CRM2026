import { resolveRollConsumedArea } from '../modules/pricing/services/rollConsumedArea';

describe('resolveRollConsumedArea', () => {
  it('bills length × roll width for 1000×2000 on 1270 roll (qty=1) → 2.54 m²', () => {
    const result = resolveRollConsumedArea({
      rollWidthMm: 1270,
      trimMm: { width: 1000, height: 2000 },
      bleedMm: 0,
      quantity: 1,
      margins: { edgeMm: 0, gapMm: 0 },
    });

    expect(result.usedRollLayout).toBe(true);
    // Подача 2 м × ширина рулона 1.27 м
    expect(result.feedMeters).toBeCloseTo(2, 4);
    expect(result.billedM2).toBeCloseTo(2.54, 4);
  });

  it('falls back to trim area when roll width is missing', () => {
    const result = resolveRollConsumedArea({
      rollWidthMm: null,
      trimMm: { width: 1000, height: 2000 },
      bleedMm: 0,
      quantity: 1,
      margins: { edgeMm: 0, gapMm: 0 },
    });

    expect(result.usedRollLayout).toBe(false);
    expect(result.billedM2).toBeCloseTo(2.0, 4);
  });

  it('nests multiple items across the roll when possible', () => {
    // Два изделия 500×1000 на рулоне 1270: в ряд поперёк помещается 2 → подача 1 м
    const result = resolveRollConsumedArea({
      rollWidthMm: 1270,
      trimMm: { width: 500, height: 1000 },
      bleedMm: 0,
      quantity: 2,
      margins: { edgeMm: 0, gapMm: 0 },
    });

    expect(result.usedRollLayout).toBe(true);
    expect(result.feedMeters).toBeCloseTo(1, 4);
    expect(result.billedM2).toBeCloseTo(1.27, 4);
  });
});
