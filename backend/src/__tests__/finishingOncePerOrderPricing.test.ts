import {
  isOncePerOrderFinishingPriceUnit,
  resolveFinishingOrderRawUnits,
  SimplifiedPricingService,
} from '../modules/pricing/services/simplifiedPricingService';
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

jest.mock('../modules/pricing/repositories/serviceRepository', () => ({
  PricingServiceRepository: {
    listServiceTiers: jest.fn(),
  },
}));

const layoutMock = (itemsPerSheet: number, sheetsNeeded: number) => ({
  fitsOnSheet: true,
  itemsPerSheet,
  sheetsNeeded,
  wastePercentage: 0,
  recommendedSheetSize: { width: 320, height: 450 },
  layout: { rows: 1, cols: itemsPerSheet, actualItemsPerSheet: itemsPerSheet },
  cutsPerSheet: 0,
});

jest.mock('../modules/pricing/services/layoutCalculationService', () => ({
  LayoutCalculationService: {
    calculateLayout: jest.fn(() => layoutMock(1, 100)),
    findOptimalSheetSize: jest.fn(() => layoutMock(1, 100)),
  },
}));

describe('resolveFinishingOrderRawUnits', () => {
  it('fixed/per_order не умножает на тираж', () => {
    expect(isOncePerOrderFinishingPriceUnit('fixed')).toBe(true);
    expect(isOncePerOrderFinishingPriceUnit('per_order')).toBe(true);
    expect(isOncePerOrderFinishingPriceUnit('per_item')).toBe(false);

    expect(resolveFinishingOrderRawUnits('fixed', 500, 1)).toBe(1);
    expect(resolveFinishingOrderRawUnits('per_order', 500, 1)).toBe(1);
    expect(resolveFinishingOrderRawUnits('per_order', 500, 2)).toBe(2);
    expect(resolveFinishingOrderRawUnits('per_item', 500, 1)).toBe(500);
    expect(resolveFinishingOrderRawUnits('per_item', 100, 2)).toBe(200);
  });
});

describe('fixed/per_order finishing billing', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const mockedListTiers = PricingServiceRepository.listServiceTiers as jest.MockedFunction<
    typeof PricingServiceRepository.listServiceTiers
  >;
  const packageServiceId = 91;
  const packageRate = 15;
  const printUnitPrice = 2;
  const quantity = 100;

  beforeEach(() => {
    jest.clearAllMocks();
    (getTableColumns as jest.Mock).mockResolvedValue(new Set<string>());
    (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layoutMock(1, quantity));
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(
      layoutMock(1, quantity),
    );
    mockedListTiers.mockResolvedValue([
      { minQuantity: 1, rate: packageRate } as any,
    ]);

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'Листовки',
            calculator_type: 'simplified',
            product_type: 'universal',
          };
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                include_material_cost: false,
                sizes: [
                  {
                    id: 'a5',
                    label: 'A5',
                    width_mm: 148,
                    height_mm: 210,
                    print_prices: [
                      {
                        technology_code: 'laser_prof',
                        color_mode: 'color',
                        sides_mode: 'single',
                        tiers: [{ min_qty: 1, unit_price: printUnitPrice }],
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
        if (query.includes('sheet_width, sheet_height FROM materials')) {
          return { sheet_width: 320, sheet_height: 450 };
        }
        if (query.includes('FROM price_types')) return null;
        if (query.includes('FROM print_prices')) return null;
        return null;
      }),
      all: jest.fn(async (query: string) => {
        if (query.includes('FROM post_processing_services')) {
          return [
            {
              id: packageServiceId,
              name: 'Упаковка',
              operation_type: 'package',
              price_unit: 'per_order',
              min_quantity: 1,
              max_quantity: null,
              parameters: null,
            },
          ];
        }
        return [];
      }),
      run: jest.fn(),
    } as any);
  });

  it('per_order: цена упаковки один раз за заказ, не × тираж', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a5',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        finishing: [{ service_id: packageServiceId, units_per_item: 1 }],
      },
      quantity,
    );

    const pack = result.finishingDetails?.find((d) => d.service_id === packageServiceId);
    expect(pack).toBeDefined();
    expect(pack?.price_unit).toBe('per_order');
    expect(pack?.raw_units_needed).toBe(1);
    expect(pack?.units_needed).toBe(1);
    expect(pack?.priceForQuantity).toBe(packageRate);
    expect(result.finishingPrice).toBe(packageRate);
    // печать: 100 листов × 2
    expect(result.printPrice).toBe(quantity * printUnitPrice);
    expect(result.finalPrice).toBe(quantity * printUnitPrice + packageRate);
  });

  it('fixed: тоже разовая цена (дизайн/доставка), не × тираж', async () => {
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'Листовки',
            calculator_type: 'simplified',
            product_type: 'universal',
          };
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                include_material_cost: false,
                sizes: [
                  {
                    id: 'a5',
                    label: 'A5',
                    width_mm: 148,
                    height_mm: 210,
                    print_prices: [
                      {
                        technology_code: 'laser_prof',
                        color_mode: 'color',
                        sides_mode: 'single',
                        tiers: [{ min_qty: 1, unit_price: printUnitPrice }],
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
        if (query.includes('sheet_width, sheet_height FROM materials')) {
          return { sheet_width: 320, sheet_height: 450 };
        }
        if (query.includes('FROM price_types')) return null;
        if (query.includes('FROM print_prices')) return null;
        return null;
      }),
      all: jest.fn(async (query: string) => {
        if (query.includes('FROM post_processing_services')) {
          return [
            {
              id: packageServiceId,
              name: 'Доставка',
              operation_type: 'delivery',
              price_unit: 'fixed',
              min_quantity: 1,
              max_quantity: null,
              parameters: null,
            },
          ];
        }
        return [];
      }),
      run: jest.fn(),
    } as any);

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a5',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        finishing: [{ service_id: packageServiceId, units_per_item: 1 }],
      },
      quantity,
    );

    const row = result.finishingDetails?.find((d) => d.service_id === packageServiceId);
    expect(row?.price_unit).toBe('fixed');
    expect(row?.priceForQuantity).toBe(packageRate);
    expect(result.finishingPrice).toBe(packageRate);
  });
});
