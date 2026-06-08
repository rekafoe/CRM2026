import {
  calculateUvFlatbedPrice,
  lookupM2TierRate,
  normalizeUvPrintConfig,
  pieceAreaM2,
  validateTrimFitsBed,
  type UvFlatbedRates,
} from '../modules/pricing/services/uvFlatbedPricingService';

const baseRates: UvFlatbedRates = {
  printPriceId: 1,
  price_color_per_m2: 50,
  price_white_per_m2: 30,
  price_varnish_per_m2: 20,
  min_charge: 15,
  max_width_mm: 600,
  max_height_mm: 900,
  m2Tiers: [
    { layer: 'color', min_m2: 0, max_m2: 0.5, price_per_m2: 50 },
    { layer: 'color', min_m2: 0.5, max_m2: null, price_per_m2: 40 },
    { layer: 'varnish', min_m2: 0, max_m2: null, price_per_m2: 20 },
  ],
};

/** Ставки без минимума — для проверки формулы слоёв */
const ratesNoMinCharge: UvFlatbedRates = { ...baseRates, min_charge: 0 };

describe('uvFlatbedPricing', () => {
  it('pieceAreaM2 for 100×210 mm', () => {
    expect(pieceAreaM2(100, 210)).toBeCloseTo(0.021, 5);
  });

  it('color 1 pass qty 1', () => {
    const r = calculateUvFlatbedPrice({
      trimWidthMm: 100,
      trimHeightMm: 210,
      quantity: 1,
      uvPrint: { color: { enabled: true, passes: 1 } },
      rates: ratesNoMinCharge,
    });
    expect(r.pieceAreaM2).toBeCloseTo(0.021, 5);
    expect(r.printPrice).toBeCloseTo(50 * 0.021, 2);
    expect(r.minChargeApplied).toBe(false);
  });

  it('color + varnish different passes', () => {
    const r = calculateUvFlatbedPrice({
      trimWidthMm: 200,
      trimHeightMm: 300,
      quantity: 2,
      uvPrint: {
        color: { enabled: true, passes: 1 },
        varnish: { enabled: true, passes: 2 },
      },
      rates: ratesNoMinCharge,
    });
    const area = 0.06;
    const totalM2 = area * 2;
    const colorRate = lookupM2TierRate(baseRates.m2Tiers, 'color', totalM2)!;
    const varnishRate = lookupM2TierRate(baseRates.m2Tiers, 'varnish', totalM2)!;
    const expected = colorRate * area * 1 * 2 + varnishRate * area * 2 * 2;
    expect(r.printPrice).toBeCloseTo(expected, 2);
  });

  it('applies min_charge when subtotal below minimum', () => {
    const r = calculateUvFlatbedPrice({
      trimWidthMm: 50,
      trimHeightMm: 50,
      quantity: 1,
      uvPrint: { color: { enabled: true, passes: 1 } },
      rates: baseRates,
    });
    expect(r.minChargeApplied).toBe(true);
    expect(r.printPrice).toBe(15);
  });

  it('tier rate at total_m2 1.05 uses second color step', () => {
    const rate = lookupM2TierRate(baseRates.m2Tiers, 'color', 1.05);
    expect(rate).toBe(40);
  });

  it('validateTrimFitsBed allows rotation', () => {
    expect(validateTrimFitsBed(900, 500, 600, 900)).toBe(true);
    expect(validateTrimFitsBed(700, 900, 600, 900)).toBe(false);
  });

  it('normalizeUvPrintConfig skips disabled or zero passes', () => {
    expect(
      normalizeUvPrintConfig({
        color: { enabled: true, passes: 1 },
        white: { enabled: false, passes: 2 },
        varnish: { enabled: true, passes: 0 },
      }),
    ).toEqual({ color: { enabled: true, passes: 1 } });
  });
});
