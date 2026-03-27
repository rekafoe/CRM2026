import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { getDb } from '../db';
import { BindingPricingService } from '../modules/pricing/services/bindingPricingService';

jest.mock('../db', () => ({
  getDb: jest.fn(),
}));

jest.mock('../modules/pricing/services/layoutCalculationService', () => ({
  LayoutCalculationService: {
    calculateLayout: jest.fn(() => ({
      fitsOnSheet: true,
      itemsPerSheet: 1,
      sheetsNeeded: 100,
      wastePercentage: 0,
      recommendedSheetSize: { width: 320, height: 450 },
      cutsPerSheet: 0,
    })),
    findOptimalSheetSize: jest.fn(() => ({
      fitsOnSheet: true,
      itemsPerSheet: 1,
      sheetsNeeded: 100,
      wastePercentage: 0,
      recommendedSheetSize: { width: 320, height: 450 },
      cutsPerSheet: 0,
    })),
  },
}));

jest.mock('../modules/pricing/services/bindingPricingService', () => ({
  BindingPricingService: {
    quoteBinding: jest.fn(),
  },
}));

describe('SimplifiedPricingService multi_page cover/innerBlock', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const mockedQuoteBinding = BindingPricingService.quoteBinding as jest.MockedFunction<typeof BindingPricingService.quoteBinding>;

  let productRow: any;
  let templateConfigData: any;

  beforeEach(() => {
    jest.clearAllMocks();

    productRow = {
      id: 1,
      name: 'Тестовая брошюра',
      calculator_type: 'simplified',
      product_type: 'multi_page',
    };

    templateConfigData = {
      simplified: {
        include_material_cost: false,
        sizes: [
          {
            id: 'a4',
            label: 'A4',
            width_mm: 210,
            height_mm: 297,
            print_prices: [
              {
                technology_code: 'laser_prof',
                color_mode: 'color',
                sides_mode: 'single',
                tiers: [{ min_qty: 1, unit_price: 2 }],
              },
            ],
            material_prices: [],
            finishing: [],
          },
        ],
      },
    };

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) return productRow;
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) };
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);

    mockedQuoteBinding.mockResolvedValue({
      serviceId: 77,
      serviceName: 'Пружина',
      priceUnit: 'per_item',
      unitPrice: 0.5,
      units: 100,
      total: 50,
    });
  });

  it('сохраняет legacy-расчет, если multiPageStructure отсутствует', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 16 as any,
      } as any,
      100
    );

    expect(result.breakdown).toBeUndefined();
    expect(result.finalPrice).toBe(200);
    expect(mockedQuoteBinding).not.toHaveBeenCalled();
  });

  it('считает cover + binding при наличии multiPageStructure', async () => {
    templateConfigData.simplified.multiPageStructure = {
      cover: {
        mode: 'self',
        qty_per_item: 1,
        print: {
          sides_mode: 'single',
        },
      },
      innerBlock: {
        pagesSource: 'parameter',
      },
      binding: {
        service_id: 77,
        units_per_item: 1,
      },
    };

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 16 as any,
      } as any,
      100
    );

    expect(mockedQuoteBinding).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 77, quantity: 100, unitsPerItem: 1 })
    );
    expect(result.breakdown).toBeDefined();
    expect(result.breakdown?.innerBlockPrice).toBe(200);
    expect(result.breakdown?.coverPrice).toBe(400);
    expect(result.breakdown?.bindingPrice).toBe(50);
    expect(result.finalPrice).toBe(650);
  });
});

