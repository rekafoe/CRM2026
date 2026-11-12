import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { LayoutCalculationService } from '../modules/pricing/services/layoutCalculationService';
import { getDb } from '../db';

jest.mock('../db', () => ({
  getDb: jest.fn(),
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

describe('duplex_as_single_x2 material billing', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const materialId = 7;
  const sheetPrice = 10;
  const printUnitPrice = 2;
  const quantity = 100;

  beforeEach(() => {
    jest.clearAllMocks();
    (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layoutMock(1, quantity));
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layoutMock(1, quantity));

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
                include_material_cost: true,
                duplex_as_single_x2: true,
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
                    allowed_material_ids: [materialId],
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
        if (query.includes('sheet_price_single FROM materials')) {
          return { sheet_price_single: sheetPrice };
        }
        if (query.includes('FROM materials m') && query.includes('paper_type')) {
          return { name: 'SRA3', density: 130, paper_type_id: 1 };
        }
        if (query.includes('FROM price_types')) return null;
        if (query.includes('FROM print_prices')) return null;
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);
  });

  it('удваивает только печать, материал остаётся sheetsNeeded × цена листа', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a5',
        material_id: materialId,
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'duplex',
      },
      quantity,
    );

    expect(result.layout?.sheetsNeeded).toBe(quantity);
    // Печать: single-tier × sheets × 2 (duplex_as_single_x2)
    expect(result.printPrice).toBe(quantity * printUnitPrice * 2);
    // Материал: один проход листа, без ×2
    expect(result.materialPrice).toBe(quantity * sheetPrice);
    expect(result.materialDetails?.priceForQuantity).toBe(quantity * sheetPrice);
  });
});
