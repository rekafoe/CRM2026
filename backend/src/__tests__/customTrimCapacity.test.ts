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

describe('SimplifiedPricingService: свой обрез не подменяет каталожный размер', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;

  const layout = (itemsPerSheet: number, fitsOnSheet = true) => ({
    fitsOnSheet,
    itemsPerSheet,
    wastePercentage: 0,
    recommendedSheetSize: { width: 320, height: 450 },
    layout: { rows: 1, cols: Math.max(itemsPerSheet, 0), actualItemsPerSheet: itemsPerSheet },
    cutsPerSheet: itemsPerSheet > 0 ? itemsPerSheet + 1 : 0,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layout(2));
    (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layout(2));

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'Листовки',
            calculator_type: 'simplified',
            product_type: 'flyers',
          };
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                allow_custom_trim: true,
                include_material_cost: false,
                sizes: [
                  {
                    id: '10x20',
                    label: '10×20 см',
                    width_mm: 100,
                    height_mm: 200,
                    min_qty: 1,
                    items_per_sheet_override: 8,
                    print_prices: [
                      {
                        technology_code: 'laser_prof',
                        color_mode: 'color',
                        sides_mode: 'single',
                        tiers: [{ min_qty: 1, unit_price: 1 }],
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

  const calc = (trim?: { width: number; height: number }) =>
    SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: '10x20',
        pricing_size_id: '10x20',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        ...(trim ? { trim_size: trim } : {}),
      } as any,
      2,
    );

  it('200×200 мм считает свою раскладку, а не 8 шт/лист размера 10×20 см', async () => {
    const result = await calc({ width: 200, height: 200 });

    expect(LayoutCalculationService.findOptimalSheetSize).toHaveBeenCalledWith(
      { width: 200, height: 200 },
      undefined,
      undefined,
      0,
    );
    expect(result.layout?.itemsPerSheet).toBe(2);
    expect(result.actualTrimMm).toEqual({ width: 200, height: 200 });
    expect(result.selectedSize).toMatchObject({
      width_mm: 200,
      height_mm: 200,
      label: '200×200 мм',
    });
    // 1 лист × 2 шт × 1
    expect(result.finalPrice).toBeCloseTo(2, 2);
  });

  it('размер, который не влезает на лист, не получает цену каталожного формата', async () => {
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layout(0, false));

    await expect(calc({ width: 400, height: 400 })).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('400×400 мм не помещается'),
    });
  });

  it('без своего обреза по-прежнему берёт норму шт/лист со строки размера', async () => {
    const result = await calc();
    expect(LayoutCalculationService.findOptimalSheetSize).not.toHaveBeenCalled();
    expect(result.layout?.itemsPerSheet).toBe(8);
    expect(result.selectedSize).toMatchObject({ width_mm: 100, height_mm: 200, label: '10×20 см' });
  });
});
