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

/**
 * Public calculate / website reprice must not trust client quantity_scope.
 * Planting quantity_scope:'run' against template per_item (implicit × qty or
 * explicit item) undercharges finishing by the print run.
 */
describe('SimplifiedPricingService: client quantity_scope cannot undercut finishing', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const mockedListTiers = PricingServiceRepository.listServiceTiers as jest.MockedFunction<
    typeof PricingServiceRepository.listServiceTiers
  >;
  const mockedGetService = PricingServiceRepository.getServiceById as jest.MockedFunction<
    typeof PricingServiceRepository.getServiceById
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    (getTableColumns as jest.Mock).mockResolvedValue(new Set<string>());
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

  it('ignores client quantity_scope:run when template has no scope (implicit × qty)', async () => {
    const honest = await SimplifiedPricingService.calculatePrice(
      42,
      {
        size_id: '90x50',
        print_technology: 'digital',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        finishing: [{ service_id: 80, units_per_item: 1, price_unit: 'per_item' }],
      } as any,
      10,
    );

    const planted = await SimplifiedPricingService.calculatePrice(
      42,
      {
        size_id: '90x50',
        print_technology: 'digital',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        finishing: [
          {
            service_id: 80,
            units_per_item: 1,
            price_unit: 'per_item',
            quantity_scope: 'run',
          },
        ],
      } as any,
      10,
    );

    // print 10 + finishing 10×2 = 20 → 30
    expect(honest.finishingPrice).toBe(20);
    expect(planted.finishingPrice).toBe(20);
    expect(planted.finalPrice).toBeCloseTo(honest.finalPrice, 4);
    expect(planted.finishingDetails?.some((d) => d.service_id === 80 && d.priceForQuantity === 20)).toBe(
      true,
    );
  });

  it('keeps template quantity_scope:item when client plants run', async () => {
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
                        quantity_scope: 'item',
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

    const planted = await SimplifiedPricingService.calculatePrice(
      42,
      {
        size_id: '90x50',
        print_technology: 'digital',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        finishing: [
          {
            service_id: 80,
            units_per_item: 1,
            price_unit: 'per_item',
            quantity_scope: 'run',
          },
        ],
      } as any,
      10,
    );

    expect(planted.finishingPrice).toBe(20);
    expect(planted.finishingDetails?.some((d) => d.service_id === 80 && d.units_needed === 10)).toBe(
      true,
    );
  });
});
