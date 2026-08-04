import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { getDb } from '../db';
import { RollWideM2PricingService } from '../modules/pricing/services/rollWideM2PricingService';

jest.mock('../db', () => ({
  getDb: jest.fn(),
}));

jest.mock('../modules/pricing/services/rollWideM2PricingService', () => ({
  RollWideM2PricingService: {
    loadRatesByTechnology: jest.fn(),
    calculate: jest.fn(),
    buildMissingRatesError: jest.fn(async (technologyCode: string) => {
      const err: Error & { status?: number } = new Error(`Missing roll_wide rates for ${technologyCode}`);
      err.status = 404;
      return err;
    }),
  },
}));

describe('roll_wide_m2 material write-off by running meters', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const mockedLoadRates = RollWideM2PricingService.loadRatesByTechnology as jest.MockedFunction<
    typeof RollWideM2PricingService.loadRatesByTechnology
  >;
  const mockedCalculate = RollWideM2PricingService.calculate as jest.MockedFunction<
    typeof RollWideM2PricingService.calculate
  >;

  const materialId = 42;
  const materialPricePerMeter = 12;

  const templateConfigData = {
    simplified: {
      use_layout: false,
      include_material_cost: true,
      roll_m2: {
        mode: 'roll_wide_m2',
      },
      sizes: [
        {
          id: 'roll',
          label: 'Рулон',
          width_mm: 300,
          height_mm: 500,
          cut_margin_mm: 0,
          cut_gap_mm: 0,
          print_prices: [],
          allowed_material_ids: [materialId],
          material_prices: [],
          finishing: [],
        },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FEATURE_ROLL_WIDE_M2 = 'true';

    mockedLoadRates.mockResolvedValue({
      printPriceId: 10,
      technologyCode: 'inkjet_solvent',
      price_color_per_m2: 20,
      min_charge: 0,
      max_width_mm: 1600,
      max_height_mm: 50000,
      supports_bw: false,
      m2PricingKind: 'roll_wide',
      tiers: [],
    });

    mockedCalculate.mockResolvedValue({
      printPrice: 150,
      pieceAreaM2: 0.15,
      totalM2: 1.5,
      minChargeApplied: false,
      ratePerM2: 100,
      quantity: 10,
      tier: null,
    });

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'ШФП постер',
            calculator_type: 'simplified',
            product_type: 'universal',
          };
        }
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) };
        }
        if (query.includes('sheet_width, sheet_height FROM materials')) {
          return { sheet_width: 610, sheet_height: null };
        }
        if (query.includes('sheet_price_single FROM materials')) {
          return { sheet_price_single: materialPricePerMeter };
        }
        if (query.includes('FROM materials m') && query.includes('paper_type_id')) {
          return { name: 'Баннер 610', density: null, paper_type_id: null };
        }
        if (query.includes('FROM print_prices') && query.includes("counter_unit = 'meters'")) {
          return null;
        }
        if (query.includes('FROM price_types WHERE key = ?')) {
          return null;
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);
  });

  it('consumes roll material as running meters with optimal placement', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'roll',
        material_id: materialId,
        print_technology: 'inkjet_solvent',
        trim_size: { width: 300, height: 500 },
      },
      10,
    );

    // На рулоне 610 мм помещается 2 шт. по 300 мм поперек → 5 рядов по 500 мм = 2.5 п.м.
    expect(result.layout?.metersNeeded).toBeCloseTo(2.5, 4);
    expect(result.layout?.sheetsNeeded).toBe(0);
    expect(result.materialPrice).toBeCloseTo(2.5 * materialPricePerMeter, 4);
    expect(result.materialDetails?.priceForQuantity).toBeCloseTo(2.5 * materialPricePerMeter, 4);
  });
});
