import { resolveConfiguredBindingInput } from '../modules/pricing/services/bindingPricingService';
import { BindingPricingService } from '../modules/pricing/services/bindingPricingService';
import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { LayoutCalculationService } from '../modules/pricing/services/layoutCalculationService';
import { PricingServiceRepository } from '../modules/pricing/repositories/serviceRepository';
import { getDb } from '../db';
import { getTableColumns } from '../utils/tableSchemaCache';

jest.mock('../db', () => ({
  getDb: jest.fn(),
}));

jest.mock('../utils/tableSchemaCache', () => ({
  getTableColumns: jest.fn(async () => new Set<string>()),
}));

jest.mock('../modules/pricing/services/layoutCalculationService', () => ({
  LayoutCalculationService: {
    calculateLayout: jest.fn(() => ({
      fitsOnSheet: true,
      itemsPerSheet: 10,
      sheetsNeeded: 1,
      wastePercentage: 0,
      recommendedSheetSize: { width: 320, height: 450 },
      layout: { rows: 2, cols: 5, actualItemsPerSheet: 10 },
      cutsPerSheet: 0,
    })),
    findOptimalSheetSize: jest.fn(() => ({
      fitsOnSheet: true,
      itemsPerSheet: 10,
      sheetsNeeded: 1,
      wastePercentage: 0,
      recommendedSheetSize: { width: 320, height: 450 },
      layout: { rows: 2, cols: 5, actualItemsPerSheet: 10 },
      cutsPerSheet: 0,
    })),
  },
}));

jest.mock('../modules/pricing/repositories/serviceRepository', () => ({
  PricingServiceRepository: {
    listServiceTiers: jest.fn(),
    getServiceById: jest.fn(),
  },
}));

jest.mock('../modules/pricing/services/bindingPricingService', () => {
  const actual = jest.requireActual('../modules/pricing/services/bindingPricingService');
  return {
    ...actual,
    BindingPricingService: {
      quoteBinding: jest.fn(),
    },
  };
});

describe('resolveConfiguredBindingInput', () => {
  it('на листовом продукте игнорирует client binding_service_id', () => {
    expect(
      resolveConfiguredBindingInput({
        usePagesMultiplier: false,
        templateBinding: null,
        clientBindingServiceId: 80,
        clientBindingUnitsPerItem: 0.001,
      }),
    ).toEqual({ serviceId: null, unitsPerItem: 1 });
  });

  it('в multi_page берёт service_id и units из шаблона, а не урезанные client units', () => {
    expect(
      resolveConfiguredBindingInput({
        usePagesMultiplier: true,
        templateBinding: { service_id: 77, units_per_item: 1, variant_id: 3 },
        clientBindingServiceId: 80,
        clientBindingUnitsPerItem: 0.001,
        clientBindingVariantId: 9,
      }),
    ).toEqual({ serviceId: 77, variantId: 9, unitsPerItem: 1 });
  });

  it('без шаблона не принимает client units < 1', () => {
    expect(
      resolveConfiguredBindingInput({
        usePagesMultiplier: true,
        templateBinding: null,
        clientBindingServiceId: 77,
        clientBindingUnitsPerItem: 0.01,
      }),
    ).toEqual({ serviceId: 77, unitsPerItem: 1 });
  });
});

describe('binding_service_id cannot zero required finishing', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const mockedQuoteBinding = BindingPricingService.quoteBinding as jest.MockedFunction<
    typeof BindingPricingService.quoteBinding
  >;
  const mockedListTiers = PricingServiceRepository.listServiceTiers as jest.MockedFunction<
    typeof PricingServiceRepository.listServiceTiers
  >;
  const mockedGetService = PricingServiceRepository.getServiceById as jest.MockedFunction<
    typeof PricingServiceRepository.getServiceById
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    (getTableColumns as jest.Mock).mockResolvedValue(new Set<string>());
    mockedQuoteBinding.mockResolvedValue({
      serviceId: 77,
      serviceName: 'Пружина',
      priceUnit: 'per_item',
      unitPrice: 0.5,
      units: 10,
      total: 5,
    });
    mockedListTiers.mockResolvedValue([
      { id: 1, serviceId: 80, minQuantity: 1, rate: 2, isActive: true },
    ] as any);
    mockedGetService.mockResolvedValue({
      id: 80,
      name: 'Ламинация',
      type: 'laminate',
      operationType: 'laminate',
      unit: 'шт',
      priceUnit: 'per_item',
      rate: 2,
      isActive: true,
    } as any);

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string, params?: unknown[]) => {
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
                include_material_cost: false,
                sizes: [
                  {
                    id: '90x50',
                    label: '90×50',
                    width_mm: 90,
                    height_mm: 50,
                    print_prices: [
                      {
                        technology_code: 'digital',
                        color_mode: 'color',
                        sides_mode: 'single',
                        tiers: [{ min_qty: 1, unit_price: 1 }],
                      },
                    ],
                    finishing: [
                      {
                        service_id: 80,
                        is_required: true,
                        units_per_item: 1,
                        price_unit: 'per_item',
                      },
                    ],
                  },
                ],
              },
            }),
          };
        }
        if (query.includes('FROM post_processing_services') && query.includes('operation_type')) {
          return { id: Number(params?.[0]), operation_type: 'laminate' };
        }
        if (query.includes('FROM price_types')) return null;
        return null;
      }),
      all: jest.fn(async (query: string) => {
        if (query.includes('FROM post_processing_services') && query.includes('WHERE id IN')) {
          return [
            {
              id: 80,
              name: 'Ламинация',
              operation_type: 'laminate',
              price_unit: 'per_item',
              min_quantity: 1,
              max_quantity: null,
              parameters: null,
            },
          ];
        }
        if (query.includes('product_operations_link')) {
          return [{ operation_id: 80 }];
        }
        return [];
      }),
      run: jest.fn(),
    } as any);
  });

  it('sheet product: crafted binding_service_id does not drop required finishing charge', async () => {
    const withoutSpoof = await SimplifiedPricingService.calculatePrice(
      42,
      {
        size_id: '90x50',
        print_technology: 'digital',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        finishing: [],
      } as any,
      10,
    );

    const withSpoof = await SimplifiedPricingService.calculatePrice(
      42,
      {
        size_id: '90x50',
        print_technology: 'digital',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        finishing: [],
        binding_service_id: 80,
        binding_units_per_item: 0.001,
      } as any,
      10,
    );

    // 1 sheet × 10 ips print unit_price 1 → print 10; finishing 10×2 = 20 → 30
    expect(withoutSpoof.finishingPrice).toBe(20);
    expect(withSpoof.finishingPrice).toBe(20);
    expect(withSpoof.finalPrice).toBe(withoutSpoof.finalPrice);
    expect(mockedQuoteBinding).not.toHaveBeenCalled();
    expect(withSpoof.finishingDetails?.some((d) => d.service_id === 80 && d.priceForQuantity === 20)).toBe(
      true,
    );
  });
});

describe('multipage binding units cannot be undercut by client', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const mockedQuoteBinding = BindingPricingService.quoteBinding as jest.MockedFunction<
    typeof BindingPricingService.quoteBinding
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    (getTableColumns as jest.Mock).mockResolvedValue(new Set<string>());
    (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue({
      fitsOnSheet: true,
      itemsPerSheet: 1,
      sheetsNeeded: 100,
      wastePercentage: 0,
      recommendedSheetSize: { width: 320, height: 450 },
      layout: { rows: 1, cols: 1, actualItemsPerSheet: 1 },
      cutsPerSheet: 0,
    });
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue({
      fitsOnSheet: true,
      itemsPerSheet: 1,
      sheetsNeeded: 100,
      wastePercentage: 0,
      recommendedSheetSize: { width: 320, height: 450 },
      layout: { rows: 1, cols: 1, actualItemsPerSheet: 1 },
      cutsPerSheet: 0,
    });

    mockedQuoteBinding.mockResolvedValue({
      serviceId: 77,
      serviceName: 'Пружина',
      priceUnit: 'per_item',
      unitPrice: 0.5,
      units: 100,
      total: 50,
    });

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string, params?: unknown[]) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'Брошюра',
            calculator_type: 'simplified',
            product_type: 'multi_page',
          };
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                include_material_cost: false,
                multiPageStructure: {
                  cover: { mode: 'self', qty_per_item: 1, print: { sides_mode: 'single' } },
                  innerBlock: { pagesSource: 'parameter' },
                  binding: { service_id: 77, units_per_item: 1 },
                },
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
                    finishing: [],
                  },
                ],
              },
            }),
          };
        }
        if (query.includes('FROM post_processing_services') && query.includes('operation_type')) {
          const id = Number(params?.[0]);
          return { id, operation_type: id === 77 ? 'bind' : 'laminate' };
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);
  });

  it('ignores client binding_units_per_item below template', async () => {
    await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 16 as any,
        binding_service_id: 80,
        binding_units_per_item: 0.001,
      } as any,
      100,
    );

    expect(mockedQuoteBinding).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 77, quantity: 100, unitsPerItem: 1 }),
    );
  });
});
