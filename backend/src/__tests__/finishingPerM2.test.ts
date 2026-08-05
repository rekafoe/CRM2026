import {
  billedM2ForQuantity,
  defaultRollFeedForPriceUnit,
  finishingFinKey,
  quotePerM2Finishing,
  resolveWarehouseFeedMeters,
} from '../modules/pricing/services/finishingPerM2';

describe('finishingPerM2', () => {
  const layout = {
    trimMm: { width: 1000, height: 2000 },
    bleedMm: 0,
    quantity: 1,
    margins: { edgeMm: 0, gapMm: 0 },
  };

  it('quotePerM2Finishing: 1270 roll → 2.54 m² × rate', () => {
    const q = quotePerM2Finishing({
      rollWidthMm: 1270,
      layout,
      rate: 10,
      serviceMinQty: 0,
      serviceLabel: 'Ламинация',
    });
    expect(q.usedRollLayout).toBe(true);
    expect(q.rawUnits).toBeCloseTo(2.54, 4);
    expect(q.feedMeters).toBeCloseTo(2, 4);
    expect(q.servicePrice).toBeCloseTo(25.4, 4);
    expect(q.warning).toBeUndefined();
  });

  it('quotePerM2Finishing: without roll width → trim area + warning', () => {
    const q = quotePerM2Finishing({
      rollWidthMm: null,
      layout,
      rate: 10,
      serviceLabel: 'Ламинация',
    });
    expect(q.usedRollLayout).toBe(false);
    expect(q.rawUnits).toBeCloseTo(2, 4);
    expect(q.feedMeters).toBeCloseTo(2, 4);
    expect(q.warning).toMatch(/без ширины рулона/);
  });

  it('resolveWarehouseFeedMeters returns feed meters for roll', () => {
    const w = resolveWarehouseFeedMeters({
      rollWidthMm: 1270,
      layout,
    });
    expect(w.usedRollLayout).toBe(true);
    expect(w.feedMeters).toBeCloseTo(2, 4);
  });

  it('A1×2 on 630 mm roll → ~1.682 feed m (lamination per_meter)', () => {
    const w = resolveWarehouseFeedMeters({
      rollWidthMm: 630,
      layout: {
        trimMm: { width: 594, height: 841 },
        bleedMm: 0,
        quantity: 2,
        margins: { edgeMm: 0, gapMm: 0 },
      },
    });
    expect(w.usedRollLayout).toBe(true);
    expect(w.feedMeters).toBeCloseTo(1.682, 3);
  });

  it('billedM2ForQuantity and finishingFinKey helpers', () => {
    expect(finishingFinKey(5, 9)).toBe('5:9');
    expect(finishingFinKey(5)).toBe('5');
    expect(
      billedM2ForQuantity({
        rollWidthMm: 1270,
        trimMm: layout.trimMm,
        quantity: 1,
        margins: layout.margins,
      })
    ).toBeCloseTo(2.54, 4);
  });

  it('defaultRollFeedForPriceUnit', () => {
    expect(defaultRollFeedForPriceUnit('per_m2')).toBe(true);
    expect(defaultRollFeedForPriceUnit('per_meter', 'laminate')).toBe(true);
    expect(defaultRollFeedForPriceUnit('per_item', 'laminate')).toBe(false);
  });
});
