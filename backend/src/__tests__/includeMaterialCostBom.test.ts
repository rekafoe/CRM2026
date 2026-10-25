import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { UnifiedPricingService } from '../modules/pricing/services/unifiedPricingService';
import { getDb } from '../db';

jest.mock('../db', () => ({
  getDb: jest.fn(),
}));

/**
 * include_material_cost=false zeroes materialPrice but historically still emitted
 * selectedMaterial → unified materials[] → Mini App/CRM components → warehouse spend.
 * Quarter calendars ship that flag with empty allow-list + use_own_materials.
 */
describe('include_material_cost=false must not emit BOM material', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const craftedMaterialId = 999;

  const templateConfigData = {
    simplified: {
      include_material_cost: false,
      use_layout: false,
      sheet_print_smoothing: false,
      cutting: false,
      material_driven_printing: false,
      types: [{ id: 'spring', key: 'spring', name: 'Пружина', default: true }],
      typeConfigs: {
        spring: {
          sizes: [
            {
              id: 'a4',
              label: 'Квартальный календарь',
              width_mm: 210,
              height_mm: 297,
              min_qty: 1,
              items_per_sheet_override: 1,
              use_own_materials: true,
              allowed_material_ids: [],
              print_prices: [
                {
                  technology_code: 'laser_sheet',
                  color_mode: 'color',
                  sides_mode: 'single',
                  tiers: [{ min_qty: 1, unit_price: 25 }],
                },
              ],
              material_prices: [],
              finishing: [],
            },
          ],
        },
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'Квартальные календари',
            calculator_type: 'simplified',
            product_type: 'calendars',
          };
        }
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) };
        }
        if (query.includes('FROM materials m') && query.includes('paper_type_id')) {
          return { name: 'Чужой SKU', density: 80, paper_type_id: null };
        }
        if (query.includes('sheet_price_single FROM materials')) {
          return { sheet_price_single: 50 };
        }
        if (query.includes('sheet_width, sheet_height FROM materials')) {
          return { sheet_width: 320, sheet_height: 450 };
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);
  });

  const configuration = {
    type_id: 'spring',
    size_id: 'a4',
    print_technology: 'laser_sheet',
    print_color_mode: 'color',
    print_sides_mode: 'single',
    material_id: craftedMaterialId,
  };

  it('SimplifiedPricingService: selectedMaterial omitted when cost is off', async () => {
    const result = await SimplifiedPricingService.calculatePrice(1, configuration as any, 3);

    expect(result.materialPrice).toBe(0);
    expect(result.selectedMaterial).toBeUndefined();
    expect(result.finalPrice).toBeCloseTo(75, 2);
  });

  it('UnifiedPricingService: materials[] must not include crafted material_id', async () => {
    const result = await UnifiedPricingService.calculatePrice(1, configuration as any, 3);

    expect(result.materials.find((m) => m.materialId === craftedMaterialId)).toBeUndefined();
    expect(result.materialCost).toBe(0);
    expect(result.finalPrice).toBeCloseTo(75, 2);
  });
});

describe('include_material_cost=true still emits selectedMaterial for BOM', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const materialId = 42;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 2,
            name: 'Листовки',
            calculator_type: 'simplified',
            product_type: 'flyers',
          };
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                include_material_cost: true,
                use_layout: false,
                sizes: [
                  {
                    id: 'a6',
                    label: 'A6',
                    width_mm: 105,
                    height_mm: 148,
                    min_qty: 1,
                    items_per_sheet_override: 1,
                    allowed_material_ids: [materialId],
                    print_prices: [
                      {
                        technology_code: 'laser_sheet',
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
        if (query.includes('FROM materials m') && query.includes('paper_type_id')) {
          return { name: 'Мелованная', density: 130, paper_type_id: 1 };
        }
        if (query.includes('sheet_price_single FROM materials')) {
          return { sheet_price_single: 2 };
        }
        if (query.includes('sheet_width, sheet_height FROM materials')) {
          return { sheet_width: 320, sheet_height: 450 };
        }
        if (query.includes('FROM paper_types')) {
          return { display_name: 'Мелованная' };
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);
  });

  it('keeps selectedMaterial when material is charged', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      2,
      {
        size_id: 'a6',
        print_technology: 'laser_sheet',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        material_id: materialId,
      } as any,
      2,
    );

    expect(result.selectedMaterial).toMatchObject({
      material_id: materialId,
      material_name: 'Мелованная',
    });
    expect(result.materialPrice).toBeCloseTo(4, 2);
  });
});
