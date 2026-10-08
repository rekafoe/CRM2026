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

  const mockDb = (minQty: number) => {
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
                    min_qty: minQty,
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
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layout(2));
    (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layout(2));
    mockDb(1);
  });

  const calc = (trim?: { width: number; height: number }, quantity = 2) =>
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
      quantity,
    );

  it('200×200 мм считает свою раскладку, а цену листа берёт с якорного размера', async () => {
    const result = await calc({ width: 200, height: 200 }, 8);

    expect(LayoutCalculationService.findOptimalSheetSize).toHaveBeenCalledWith(
      { width: 200, height: 200 },
      undefined,
      undefined,
      0,
    );
    expect(result.layout?.itemsPerSheet).toBe(2);
    expect(result.layout?.sheetsNeeded).toBe(4);
    expect(result.actualTrimMm).toEqual({ width: 200, height: 200 });
    expect(result.selectedSize).toMatchObject({
      width_mm: 200,
      height_mm: 200,
      label: '200×200 мм',
    });
    // 4 листа × цена листа каталога (8 шт × 1), а не 8 × ставка за штуку
    expect(result.finalPrice).toBeCloseTo(32, 2);
  });

  it('размер, который не влезает на лист, не получает цену каталожного формата', async () => {
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layout(0, false));

    await expect(calc({ width: 400, height: 400 })).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('400×400 мм не помещается'),
    });
  });

  it('свой обрез не требует мин. тираж каталожной строки', async () => {
    mockDb(100);
    const custom = await calc({ width: 200, height: 200 }, 2);
    expect(custom.layout?.sheetsNeeded).toBe(1);
    expect(custom.finalPrice).toBeCloseTo(8, 2);

    await expect(calc(undefined, 2)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('не меньше 100'),
    });
  });

  it('без своего обреза по-прежнему берёт норму шт/лист со строки размера', async () => {
    const result = await calc();
    expect(LayoutCalculationService.findOptimalSheetSize).not.toHaveBeenCalled();
    expect(result.layout?.itemsPerSheet).toBe(8);
    expect(result.layout?.sheetsNeeded).toBe(1);
    expect(result.selectedSize).toMatchObject({ width_mm: 100, height_mm: 200, label: '10×20 см' });
    // 1 лист × 8 шт × 1 — каталожная норма не меняется
    expect(result.finalPrice).toBeCloseTo(8, 2);
  });
});

describe('allow_custom_trim=false: mismatched trim_size must not undercharge', () => {
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
          return { id: 1, name: 'Листовки', calculator_type: 'simplified', product_type: 'flyers' };
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                allow_custom_trim: false,
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

  it('size_id + oversized trim_size is rejected (no catalog override undercharge)', async () => {
    await expect(
      SimplifiedPricingService.calculatePrice(
        1,
        {
          size_id: '10x20',
          print_technology: 'laser_prof',
          print_color_mode: 'color',
          print_sides_mode: 'single',
          trim_size: { width: 200, height: 200 },
        } as any,
        8,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('allow_custom_trim'),
    });
    expect(LayoutCalculationService.findOptimalSheetSize).not.toHaveBeenCalled();
  });

  it('matching trim_size (incl. rotation) still uses catalog override', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: '10x20',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        trim_size: { width: 200, height: 100 },
      } as any,
      8,
    );
    expect(result.layout?.itemsPerSheet).toBe(8);
    expect(result.layout?.sheetsNeeded).toBe(1);
    expect(result.finalPrice).toBeCloseTo(8, 2);
    expect(result.actualTrimMm).toEqual({ width: 100, height: 200 });
  });
});
