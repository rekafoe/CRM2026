import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { LayoutCalculationService } from '../modules/pricing/services/layoutCalculationService';
import {
  productAllowedPriceTypesFromConstraints,
  resolveAllowedPriceTypeKeys,
  sanitizePriceTypeKeyForBilling,
} from '../modules/pricing/services/priceTypeService';
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
    calculateLayout: jest.fn(() => layoutMock(10)),
    findOptimalSheetSize: jest.fn(() => layoutMock(10)),
  },
}));

describe('priceType allow-list helpers', () => {
  it('берёт overrides.allowed_price_types раньше корневого списка', () => {
    expect(
      productAllowedPriceTypesFromConstraints({
        allowed_price_types: ['standard', 'promo'],
        overrides: { allowed_price_types: ['standard', 'online'] },
      }),
    ).toEqual(['standard', 'online']);
  });

  it('пересекает продукт и подтип', () => {
    expect(
      resolveAllowedPriceTypeKeys({
        productAllowed: ['standard', 'online', 'promo'],
        subtypeAllowed: ['online', 'special'],
      }),
    ).toEqual(['online']);
  });

  it('сбрасывает чужой и неактивный ключ в standard', () => {
    expect(
      sanitizePriceTypeKeyForBilling('special', ['standard', 'online'], {
        key: 'special',
        isActive: true,
      }),
    ).toBe('standard');
    expect(
      sanitizePriceTypeKeyForBilling('online', [], { key: 'online', isActive: false }),
    ).toBe('standard');
    expect(
      sanitizePriceTypeKeyForBilling('online', ['standard', 'online'], {
        key: 'online',
        isActive: true,
      }),
    ).toBe('online');
  });
});

describe('SimplifiedPricingService: priceType allow-list на сервере', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;

  const priceTypes: Record<string, { key: string; multiplier: number; is_active: number }> = {
    standard: { key: 'standard', multiplier: 1, is_active: 1 },
    online: { key: 'online', multiplier: 0.825, is_active: 1 },
    special: { key: 'special', multiplier: 0.55, is_active: 1 },
    promo: { key: 'promo', multiplier: 0.7, is_active: 0 },
  };

  function mockDb(opts?: { allowed?: string[]; subtypeAllowed?: string[] }) {
    const allowed = opts?.allowed ?? ['standard', 'online'];
    const subtypeAllowed = opts?.subtypeAllowed;
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string, ...params: unknown[]) => {
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
                ...(subtypeAllowed
                  ? {
                      types: [{ id: 10, name: 'Круг' }],
                      typeConfigs: {
                        '10': {
                          allowed_price_types: subtypeAllowed,
                          sizes: [
                            {
                              id: 'round-40',
                              label: 'круг 40 мм',
                              width_mm: 40,
                              height_mm: 40,
                              min_qty: 10,
                              items_per_sheet_override: 10,
                              print_prices: [
                                {
                                  technology_code: 'laser_prof',
                                  color_mode: 'color',
                                  sides_mode: 'single',
                                  tiers: [{ min_qty: 10, unit_price: 1 }],
                                },
                              ],
                              material_prices: [],
                              finishing: [],
                            },
                          ],
                        },
                      },
                    }
                  : {
                      sizes: [
                        {
                          id: 'round-40',
                          label: 'круг 40 мм',
                          width_mm: 40,
                          height_mm: 40,
                          min_qty: 10,
                          items_per_sheet_override: 10,
                          print_prices: [
                            {
                              technology_code: 'laser_prof',
                              color_mode: 'color',
                              sides_mode: 'single',
                              tiers: [{ min_qty: 10, unit_price: 1 }],
                            },
                          ],
                          material_prices: [],
                          finishing: [],
                        },
                      ],
                    }),
              },
            }),
            constraints: JSON.stringify({
              overrides: { allowed_price_types: allowed },
            }),
          };
        }
        if (query.includes('FROM price_types WHERE key = ?')) {
          const key = String(params[0] ?? '');
          const row = priceTypes[key];
          if (!row) return null;
          return {
            id: 1,
            key: row.key,
            name: row.key,
            multiplier: row.multiplier,
            production_days: 3,
            description: null,
            sort_order: 0,
            is_system: 0,
            is_active: row.is_active,
            created_at: null,
            updated_at: null,
          };
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layoutMock(10));
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layoutMock(10));
  });

  const calc = (priceType: string, extra: Record<string, unknown> = {}) =>
    SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'round-40',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        priceType,
        ...extra,
      } as any,
      10,
    );

  it('не даёт special (×0.55), если продукт разрешил только standard/online', async () => {
    mockDb({ allowed: ['standard', 'online'] });
    const standard = await calc('standard');
    const forged = await calc('special');
    // 10 шт × 1.00 без скидки special
    expect(standard.finalPrice).toBeCloseTo(10, 2);
    expect(forged.finalPrice).toBeCloseTo(standard.finalPrice, 2);
    expect(forged.finalPrice).toBeGreaterThan(10 * 0.55 + 0.01);
  });

  it('применяет online, когда он в allow-list', async () => {
    mockDb({ allowed: ['standard', 'online'] });
    const online = await calc('online');
    expect(online.finalPrice).toBeCloseTo(8.25, 2);
  });

  it('не применяет выключенный promo даже без allow-list', async () => {
    mockDb({ allowed: [] });
    const standard = await calc('standard');
    const promo = await calc('promo');
    expect(promo.finalPrice).toBeCloseTo(standard.finalPrice, 2);
  });

  it('учитывает allow-list подтипа', async () => {
    mockDb({ allowed: ['standard', 'online', 'special'], subtypeAllowed: ['standard', 'online'] });
    const forged = await calc('special', { typeId: 10 });
    const standard = await calc('standard', { typeId: 10 });
    expect(forged.finalPrice).toBeCloseTo(standard.finalPrice, 2);
  });
});
