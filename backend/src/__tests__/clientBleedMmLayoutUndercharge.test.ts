import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { LayoutCalculationService } from '../modules/pricing/services/layoutCalculationService';
import { getDb } from '../db';

jest.mock('../db', () => ({
  getDb: jest.fn(),
}));

jest.mock('../modules/pricing/services/layoutCalculationService', () => ({
  LayoutCalculationService: {
    calculateLayout: jest.fn(),
    findOptimalSheetSize: jest.fn(),
  },
}));

/**
 * Public calculate / website reprice must not trust client bleed_mm.
 * Planting bleed_mm:0 against template default_bleed_mm undercharges via denser layout.
 */
describe('SimplifiedPricingService: client bleed_mm cannot undercut template layout', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;

  const layout = (itemsPerSheet: number) => ({
    fitsOnSheet: true,
    itemsPerSheet,
    wastePercentage: 0,
    recommendedSheetSize: { width: 320, height: 450 },
    layout: { rows: 1, cols: itemsPerSheet, actualItemsPerSheet: itemsPerSheet },
    cutsPerSheet: itemsPerSheet + 1,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 42,
            name: 'Визитки',
            calculator_type: 'simplified',
            product_type: 'business_cards',
          };
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                default_bleed_mm: 3,
                include_material_cost: false,
                sizes: [
                  {
                    id: '90x50',
                    label: '90×50',
                    width_mm: 90,
                    height_mm: 50,
                    min_qty: 1,
                    print_prices: [
                      {
                        technology_code: 'laser_prof',
                        color_mode: 'color',
                        sides_mode: 'single',
                        tiers: [{ min_qty: 1, unit_price: 0.1 }],
                      },
                    ],
                    material_prices: [],
                    finishing: [],
                  },
                ],
              },
            }),
          };
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);

    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockImplementation(
      (_trim: unknown, _m?: unknown, _g?: unknown, bleedMm?: number) =>
        layout(Number(bleedMm) > 0 ? 10 : 40),
    );
    (LayoutCalculationService.calculateLayout as jest.Mock).mockImplementation(
      (_trim: unknown, _sheet: unknown, _m?: unknown, _g?: unknown, bleedMm?: number) =>
        layout(Number(bleedMm) > 0 ? 10 : 40),
    );
  });

  const calc = (bleedMm?: number) =>
    SimplifiedPricingService.calculatePrice(
      42,
      {
        size_id: '90x50',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        ...(bleedMm != null ? { bleed_mm: bleedMm } : {}),
      } as any,
      100,
    );

  it('ignores client bleed_mm:0 and keeps template default_bleed_mm for layout', async () => {
    const honest = await calc();
    const planted = await calc(0);

    expect(LayoutCalculationService.findOptimalSheetSize).toHaveBeenCalledWith(
      { width: 90, height: 50 },
      undefined,
      undefined,
      3,
    );
    expect(honest.layout?.itemsPerSheet).toBe(10);
    expect(planted.layout?.itemsPerSheet).toBe(10);
    expect(honest.layout?.sheetsNeeded).toBe(10);
    expect(planted.layout?.sheetsNeeded).toBe(10);
    expect(planted.finalPrice).toBeCloseTo(honest.finalPrice, 4);
  });
});
