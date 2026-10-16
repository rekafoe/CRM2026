import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { getDb } from '../db';
import { PlotterCuttingTariffRepository } from '../modules/pricing/repositories/plotterCuttingTariffRepository';
import { PLOTTER_FIN_MOUNTING, PLOTTER_FIN_ROLL } from '../modules/pricing/constants/plotterCuttingFinishingIds';

jest.mock('../db', () => ({
  getDb: jest.fn(),
}));

jest.mock('../utils/tableSchemaCache', () => ({
  getTableColumns: jest.fn(async () => new Set<string>()),
  hasColumn: jest.fn(async () => false),
  invalidateTableSchemaCache: jest.fn(),
}));

jest.mock('../modules/pricing/repositories/plotterCuttingTariffRepository', () => ({
  PlotterCuttingTariffRepository: {
    getBundle: jest.fn(),
  },
}));

/**
 * После d5a5e602 продукт не тарифицирует накатку, но до фикса всё ещё списывал
 * mounting_film_material_id при configuration.plotter_mounting=true (legacy specs / craft).
 */
describe('plotter product: no mounting film spend without mounting charge', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const mockedGetBundle = PlotterCuttingTariffRepository.getBundle as jest.MockedFunction<
    typeof PlotterCuttingTariffRepository.getBundle
  >;

  const printMaterialId = 10;
  const mountingFilmId = 77;

  const templateConfigData = {
    simplified: {
      use_layout: true,
      include_material_cost: true,
      types: [{ id: 1, name: 'Наклейки', default: true }],
      typeConfigs: {
        '1': {
          plotter: {
            enabled: true,
            mode: 'roll',
            mounting_film_material_id: mountingFilmId,
          },
          sizes: [
            {
              id: 's1',
              label: '105×105',
              width_mm: 105,
              height_mm: 105,
              cut_margin_mm: 25,
              cut_gap_mm: 2,
              print_prices: [
                {
                  technology_code: 'latex',
                  color_mode: 'color',
                  sides_mode: 'single',
                  tiers: [{ min_qty: 1, price: 1 }],
                },
              ],
              allowed_material_ids: [printMaterialId],
              material_prices: [{ material_id: printMaterialId, tiers: [{ min_qty: 1, price: 2 }] }],
              finishing: [],
            },
          ],
        },
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetBundle.mockResolvedValue({
      roll: {
        mode: 'roll',
        label: 'roll',
        price_per_meter: 5,
        meter_basis: 'feed',
        volume_tier_basis: null,
        min_quantity: 1,
        max_quantity: null,
        operator_percent: null,
        material_id: null,
        qty_per_item: null,
        weeding_price_per_item: null,
        mounting_price_per_item: null,
        volume_tiers: [{ min_quantity: 1, price_per_unit: 5 }],
      },
      sheet: {
        mode: 'sheet',
        label: 'sheet',
        price_per_meter: 5,
        meter_basis: 'knife_path',
        volume_tier_basis: null,
        min_quantity: 1,
        max_quantity: null,
        operator_percent: null,
        material_id: null,
        qty_per_item: null,
        weeding_price_per_item: null,
        mounting_price_per_item: null,
      },
    } as any);

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string, params?: unknown[]) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'Наклейки плоттер',
            calculator_type: 'simplified',
            product_type: 'universal',
          };
        }
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) };
        }
        if (query.includes('sheet_width, sheet_height FROM materials')) {
          return { sheet_width: 630, sheet_height: null };
        }
        if (query.includes('sheet_price_single FROM materials')) {
          return { sheet_price_single: 2 };
        }
        if (query.includes('FROM materials m') && query.includes('paper_type_id')) {
          return { name: 'Плёнка печать', density: null, paper_type_id: null };
        }
        if (query.includes('FROM materials WHERE id = ? AND is_active = 1')) {
          const id = Number(params?.[0]);
          if (id === mountingFilmId) return { name: 'Плёнка накатки' };
          if (id === printMaterialId) return { name: 'Плёнка печать' };
          return null;
        }
        if (query.includes('FROM print_prices') && query.includes("counter_unit = 'meters'")) {
          return null;
        }
        if (query.includes('FROM price_types WHERE key = ?')) {
          return null;
        }
        return null;
      }),
      all: jest.fn(async (query: string) => {
        if (query.includes('FROM post_processing_services')) {
          return [];
        }
        if (query.includes('FROM materials') && query.includes('printable_width')) {
          return [];
        }
        return [];
      }),
      run: jest.fn(),
    } as any);
  });

  it('ignores legacy plotter_mounting=true: no mounting film in operationMaterials and no PLOTTER_FIN_MOUNTING', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        type_id: 1,
        size_id: 's1',
        material_id: printMaterialId,
        print_technology: 'latex',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        plotter_mounting: true,
        finishing: [],
      } as any,
      100,
    );

    expect(result.layout?.metersNeeded).toBeGreaterThan(0);
    expect(result.operationMaterials ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ material_id: mountingFilmId })]),
    );
    const finIds = (result.finishingDetails ?? []).map((d) => d.service_id);
    expect(finIds).not.toContain(PLOTTER_FIN_MOUNTING);
    expect(finIds).toContain(PLOTTER_FIN_ROLL);
  });
});
