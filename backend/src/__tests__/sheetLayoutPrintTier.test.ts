import { sheetLayoutPrintTierQuantity } from '../modules/pricing/utils/sheetLayoutPrintTierQuantity';
import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { LayoutCalculationService } from '../modules/pricing/services/layoutCalculationService';
import { getDb } from '../db';

jest.mock('../db', () => ({
  getDb: jest.fn(),
}));

const layoutMock = (itemsPerSheet: number) => ({
  fitsOnSheet: true,
  itemsPerSheet,
  sheetsNeeded: 1,
  wastePercentage: 0,
  recommendedSheetSize: { width: 320, height: 450 },
  layout: { rows: 1, cols: itemsPerSheet, actualItemsPerSheet: itemsPerSheet },
  cutsPerSheet: itemsPerSheet + 1,
});

jest.mock('../modules/pricing/services/layoutCalculationService', () => ({
  LayoutCalculationService: {
    calculateLayout: jest.fn(() => layoutMock(54)),
    findOptimalSheetSize: jest.fn(() => layoutMock(54)),
  },
}));

describe('sheetLayoutPrintTierQuantity', () => {
  it('округляет тираж вверх до полных листов раскладки', () => {
    expect(sheetLayoutPrintTierQuantity(54, 54)).toBe(54);
    expect(sheetLayoutPrintTierQuantity(55, 54)).toBe(108);
    expect(sheetLayoutPrintTierQuantity(107, 54)).toBe(108);
    expect(sheetLayoutPrintTierQuantity(108, 54)).toBe(108);
    expect(sheetLayoutPrintTierQuantity(109, 54)).toBe(162);
  });

  it('при 1 шт/лист не меняет количество', () => {
    expect(sheetLayoutPrintTierQuantity(107, 1)).toBe(107);
  });
});

describe('SimplifiedPricingService: листовые ступени печати по раскладке', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layoutMock(54));
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layoutMock(54));

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'Наклейки',
            calculator_type: 'simplified',
            product_type: 'stickers',
          };
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                include_material_cost: false,
                sizes: [
                  {
                    id: 'round-40',
                    label: 'круг 40 мм',
                    width_mm: 40,
                    height_mm: 40,
                    min_qty: 54,
                    items_per_sheet_override: 54,
                    print_prices: [
                      {
                        technology_code: 'laser_prof',
                        color_mode: 'color',
                        sides_mode: 'single',
                        tiers: [
                          { min_qty: 54, max_qty: 107, unit_price: 0.35 },
                          { min_qty: 108, max_qty: 161, unit_price: 0.23 },
                          { min_qty: 162, unit_price: 0.18 },
                        ],
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
  });

  const calc = (quantity: number) =>
    SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'round-40',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
      } as any,
      quantity,
    );

  it('107 и 108 шт. (оба 2 листа) дают одну цену, без провала на кратной раскладке', async () => {
    const p107 = await calc(107);
    const p108 = await calc(108);
    // 2 листа × 54 × 0.23 (тариф 2 листов)
    expect(p108.finalPrice).toBeCloseTo(24.84, 2);
    expect(p107.finalPrice).toBeCloseTo(p108.finalPrice, 2);
  });

  it('109 шт. переходят на 3 листа и тариф 3 листов', async () => {
    const p108 = await calc(108);
    const p109 = await calc(109);
    // 3 листа × 54 × 0.18
    expect(p109.finalPrice).toBeCloseTo(29.16, 2);
    expect(p109.finalPrice).toBeGreaterThan(p108.finalPrice);
  });
});
