import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { LayoutCalculationService } from '../modules/pricing/services/layoutCalculationService';
import { getDb } from '../db';
import { getTableColumns } from '../utils/tableSchemaCache';

jest.mock('../db', () => ({
  getDb: jest.fn(),
}));

jest.mock('../utils/tableSchemaCache', () => ({
  getTableColumns: jest.fn(async () => new Set(['sheet_thickness_mm', 'spine_thickness_mm', 'channel_min_mm', 'channel_max_mm'])),
  hasColumn: jest.fn(async () => false),
  invalidateTableSchemaCache: jest.fn(),
}));

const layoutMock = {
  fitsOnSheet: true,
  itemsPerSheet: 1,
  sheetsNeeded: 10,
  wastePercentage: 0,
  recommendedSheetSize: { width: 320, height: 450 },
  layout: { rows: 1, cols: 1, actualItemsPerSheet: 1 },
  cutsPerSheet: 0,
};

jest.mock('../modules/pricing/services/layoutCalculationService', () => ({
  LayoutCalculationService: {
    calculateLayout: jest.fn(() => layoutMock),
    findOptimalSheetSize: jest.fn(() => layoutMock),
  },
}));

jest.mock('../modules/pricing/repositories/serviceRepository', () => ({
  PricingServiceRepository: {
    listServiceTiers: jest.fn(async () => []),
    getServiceById: jest.fn(async () => null),
  },
}));

jest.mock('../modules/pricing/services/bindingPricingService', () => {
  const actual = jest.requireActual('../modules/pricing/services/bindingPricingService');
  return {
    ...actual,
    BindingPricingService: { quoteBinding: jest.fn(async () => null) },
  };
});

/**
 * Public calculate / website reprice must not return success with readyLidPrice=0
 * (or wrap board $0) when the required material is missing — that locked undercharge.
 */
describe('SimplifiedPricingService: ready lid / wrap board required', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layoutMock);
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layoutMock);
    (getTableColumns as jest.Mock).mockResolvedValue(
      new Set(['sheet_thickness_mm', 'spine_thickness_mm', 'channel_min_mm', 'channel_max_mm']),
    );
  });

  it('rejects ready lid calculate without lid_material_id (no silent $0)', async () => {
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return { id: 1, name: 'Альбом', calculator_type: 'simplified', product_type: 'multi_page' };
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                include_material_cost: true,
                pages: { options: [], min: 4, max: 200, step: 2 },
                multiPageStructure: {
                  coverChoice: 'ready',
                  innerBlock: { pagesSource: 'parameter' },
                  cover: { mode: 'none' },
                  readyLid: { cover_material_ids: [70, 71], channel_material_ids: [80] },
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

    await expect(
      SimplifiedPricingService.calculatePrice(
        1,
        {
          size_id: 'a4',
          print_technology: 'laser_prof',
          print_color_mode: 'color',
          print_sides_mode: 'single',
          pages: 10,
          material_id: 12,
        } as any,
        10,
      ),
    ).rejects.toMatchObject({ status: 400, message: 'Выберите крышку' });
  });

  it('defaults sole ready-lid allowlist id and charges 2× lid', async () => {
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string, params?: unknown[]) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return { id: 1, name: 'Альбом', calculator_type: 'simplified', product_type: 'multi_page' };
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                include_material_cost: true,
                pages: { options: [], min: 4, max: 200, step: 2 },
                multiPageStructure: {
                  coverChoice: 'ready',
                  innerBlock: { pagesSource: 'parameter' },
                  cover: { mode: 'none' },
                  readyLid: { cover_material_ids: [70], channel_material_ids: [] },
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
        if (query.includes('sheet_thickness_mm') && Number(params?.[0]) === 12) {
          return { sheet_thickness_mm: 0.1 };
        }
        if (query.includes('spine_thickness_mm') && Number(params?.[0]) === 70) {
          return { name: 'Крышка', sheet_price_single: 3, spine_thickness_mm: 0.4 };
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 10,
        material_id: 12,
      } as any,
      5,
    );

    // 10 стр × 5 × 1 + 2 крышки × 3 × 5
    expect(result.breakdown?.readyLidPrice).toBe(30);
    expect(result.operationMaterials).toEqual(
      expect.arrayContaining([{ material_id: 70, material_name: 'Крышка', quantity: 10 }]),
    );
  });

  it('rejects wrap calculate when board unresolved among several ids', async () => {
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return { id: 1, name: 'Альбом', calculator_type: 'simplified', product_type: 'multi_page' };
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                include_material_cost: true,
                pages: { options: [], min: 4, max: 200, step: 2 },
                multiPageStructure: {
                  coverChoice: 'printed',
                  innerBlock: { pagesSource: 'parameter' },
                  cover: {
                    mode: 'separate',
                    wrap: true,
                    page_count: 2,
                    board_material_ids: [41, 42],
                    print: { technology_code: 'laser_prof', color_mode: 'color', sides_mode: 'single' },
                  },
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

    await expect(
      SimplifiedPricingService.calculatePrice(
        1,
        {
          size_id: 'a4',
          print_technology: 'laser_prof',
          print_color_mode: 'color',
          print_sides_mode: 'single',
          pages: 10,
        } as any,
        10,
      ),
    ).rejects.toMatchObject({ status: 400, message: 'Выберите переплётный картон' });
  });
});
