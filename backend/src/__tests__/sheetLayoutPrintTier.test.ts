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

  it('тираж меньше листа не отклоняется и стоит как один лист', async () => {
    const below = await calc(20);
    const oneSheet = await calc(54);
    expect(below.finalPrice).toBeCloseTo(oneSheet.finalPrice, 2);
    expect(below.quantityRecommendation).toEqual({
      itemsPerSheet: 54,
      pricedQuantity: 54,
      recommendedQuantity: 54,
    });
  });

  it('промежуточный тираж подсказывает соседние листы и не меняет цену', async () => {
    const mid = await calc(107);
    expect(mid.quantityRecommendation).toEqual({
      itemsPerSheet: 54,
      pricedQuantity: 107,
      lowerQuantity: 54,
      higherQuantity: 108,
    });
  });

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

describe('SimplifiedPricingService: плавный переход тиражной скидки печати', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;

  const makeConfig = (tiers: Array<{ min_qty: number; unit_price: number }>) => ({
    config_data: JSON.stringify({
      simplified: {
        include_material_cost: false,
        sizes: [
          {
            id: 'postcard',
            label: 'открытка',
            width_mm: 100,
            height_mm: 150,
            min_qty: 10,
            items_per_sheet_override: 10,
            print_prices: [
              {
                technology_code: 'laser_prof',
                color_mode: 'color',
                sides_mode: 'single',
                tiers,
              },
            ],
            material_prices: [],
            finishing: [],
          },
        ],
      },
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layoutMock(10));
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layoutMock(10));
  });

  const calcWithTiers = (
    tiers: Array<{ min_qty: number; unit_price: number }>,
    quantity: number,
  ) => {
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'Открытки',
            calculator_type: 'simplified',
            product_type: 'postcards',
          };
        }
        if (query.includes('FROM product_template_configs')) {
          return makeConfig(tiers);
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);

    return SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'postcard',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
      } as any,
      quantity,
    );
  };

  it('между 30 и 50 листами цена растёт плавно, без скачка дороже следующего порога', async () => {
    const tiers = [
      { min_qty: 300, unit_price: 130 },
      { min_qty: 500, unit_price: 91 },
    ];
    const p300 = await calcWithTiers(tiers, 300);
    const p400 = await calcWithTiers(tiers, 400);
    const p500 = await calcWithTiers(tiers, 500);
    expect(p300.finalPrice).toBeCloseTo(39000, 2);
    expect(p500.finalPrice).toBeCloseTo(45500, 2);
    expect(p400.finalPrice).toBeCloseTo(42250, 2);
    expect(p400.finalPrice).toBeGreaterThan(p300.finalPrice);
    expect(p400.finalPrice).toBeLessThan(p500.finalPrice);
    expect(p400.finalPrice).toBeLessThan(40 * 130 * 10);
  });

  it('если 30 листов по тарифу дороже 50, меньший тираж не дороже большего', async () => {
    const tiers = [
      { min_qty: 300, unit_price: 200 },
      { min_qty: 500, unit_price: 50 },
    ];
    const p300 = await calcWithTiers(tiers, 300);
    const p400 = await calcWithTiers(tiers, 400);
    const p500 = await calcWithTiers(tiers, 500);
    expect(p500.finalPrice).toBeCloseTo(25000, 2);
    expect(p300.finalPrice).toBeCloseTo(p500.finalPrice, 2);
    expect(p400.finalPrice).toBeCloseTo(p500.finalPrice, 2);
  });
});

describe('SimplifiedPricingService: ступенчатая цена без сглаживания', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const calendarTiers = [
    { min_qty: 1, max_qty: 1, unit_price: 27 },
    { min_qty: 2, max_qty: 49, unit_price: 22.8 },
    { min_qty: 50, max_qty: 99, unit_price: 13.8 },
    { min_qty: 100, unit_price: 9 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layoutMock(1));
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layoutMock(1));
  });

  const calc = (quantity: number, smoothing: boolean) => {
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'Календари квартальные',
            calculator_type: 'simplified',
            product_type: 'sheet_single',
          };
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                include_material_cost: false,
                use_layout: false,
                sheet_print_smoothing: smoothing,
                sizes: [
                  {
                    id: 910101,
                    label: 'Квартальный календарь',
                    width_mm: 210,
                    height_mm: 297,
                    min_qty: 1,
                    items_per_sheet_override: 1,
                    print_prices: [
                      {
                        technology_code: 'laser_prof',
                        color_mode: 'color',
                        sides_mode: 'single',
                        tiers: calendarTiers,
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

    return SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 910101,
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
      } as any,
      quantity,
    );
  };

  it('держит цену ступени на 5 и 10 штуках и оставляет обрыв между 49 и 50', async () => {
    const one = await calc(1, false);
    const five = await calc(5, false);
    const ten = await calc(10, false);
    const fortyNine = await calc(49, false);
    const fifty = await calc(50, false);
    const hundred = await calc(100, false);

    expect(one.finalPrice).toBeCloseTo(27, 2);
    expect(five.finalPrice).toBeCloseTo(114, 2);
    expect(ten.finalPrice).toBeCloseTo(228, 2);
    expect(fortyNine.finalPrice).toBeCloseTo(1117.2, 2);
    expect(fifty.finalPrice).toBeCloseTo(690, 2);
    expect(hundred.finalPrice).toBeCloseTo(900, 2);
    expect(fortyNine.finalPrice).toBeGreaterThan(fifty.finalPrice);
  });

  it('без флага по-прежнему интерполирует середину диапазона', async () => {
    const ten = await calc(10, true);
    expect(ten.finalPrice).toBeCloseTo(153, 2);
    expect(ten.finalPrice).toBeLessThan(228);
  });
});

