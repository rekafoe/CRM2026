import { getDb } from '../db'
import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService'
import { LayoutCalculationService } from '../modules/pricing/services/layoutCalculationService'
import { PlotterCuttingTariffRepository } from '../modules/pricing/repositories/plotterCuttingTariffRepository'
import { PLOTTER_FIN_SHEET } from '../modules/pricing/constants/plotterCuttingFinishingIds'

jest.mock('../db', () => ({
  getDb: jest.fn(),
}))

jest.mock('../utils/tableSchemaCache', () => ({
  getTableColumns: jest.fn(async () => new Set<string>()),
  hasColumn: jest.fn(async () => false),
}))

jest.mock('../modules/pricing/services/layoutCalculationService', () => ({
  LayoutCalculationService: {
    calculateLayout: jest.fn(() => ({
      fitsOnSheet: true,
      itemsPerSheet: 1,
      sheetsNeeded: 10,
      wastePercentage: 0,
      recommendedSheetSize: { width: 320, height: 450 },
      layout: { rows: 1, cols: 1, actualItemsPerSheet: 1 },
      cutsPerSheet: 2,
    })),
    findOptimalSheetSize: jest.fn(),
  },
}))

jest.mock('../modules/pricing/repositories/plotterCuttingTariffRepository', () => ({
  PlotterCuttingTariffRepository: {
    getBundle: jest.fn(async () => ({
      sheet: {
        rate_per_meter: 0.5,
        min_charge: 0,
        volume_tier_basis: 'knife_path',
        meter_basis: 'knife_path',
        cut_level_rules: [],
        tiers: [{ min_qty: 1, rate: 0.5 }],
      },
      roll: {
        rate_per_meter: 0.8,
        min_charge: 0,
        volume_tier_basis: 'knife_path',
        meter_basis: 'knife_path',
        cut_level_rules: [],
        tiers: [{ min_qty: 1, rate: 0.8 }],
      },
      weeding: { rate_per_meter: 0, tiers: [] },
      mounting: { rate_per_meter: 0, tiers: [] },
    })),
  },
}))

describe('plotter mode=auto without material_driven', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>

  beforeEach(() => {
    jest.clearAllMocks()
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'Наклейки',
            calculator_type: 'simplified',
            product_type: 'stickers',
          }
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                include_material_cost: false,
                types: [{ id: 1, name: 'Прямоугольные', default: true }],
                typeConfigs: {
                  '1': {
                    plotter: { enabled: true, mode: 'auto' },
                    sizes: [
                      {
                        id: '50x50',
                        label: '50×50',
                        width_mm: 50,
                        height_mm: 50,
                        min_qty: 1,
                        allowed_material_ids: [10],
                        print_prices: [
                          {
                            technology_code: 'laser_prof',
                            color_mode: 'color',
                            sides_mode: 'single',
                            tiers: [{ min_qty: 1, unit_price: 0.4 }],
                          },
                        ],
                        finishing: [],
                      },
                    ],
                  },
                },
              },
            }),
          }
        }
        if (query.includes('FROM materials WHERE id = ?')) {
          return {
            sheet_width: 320,
            sheet_height: 450,
            sheet_price_single: 0.1,
            name: 'SRA3',
            density: 300,
            material_kind: 'sheet',
          }
        }
        return null
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any)
  })

  it('keeps plotter enabled and selects sheet mode from warehouse material_kind', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        typeId: 1,
        size_id: '50x50',
        material_id: 10,
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
      } as any,
      10,
    )

    expect(PlotterCuttingTariffRepository.getBundle).toHaveBeenCalled()
    expect(result.finishingDetails?.some((f) => Number(f.service_id) === PLOTTER_FIN_SHEET)).toBe(true)
    expect(result.printPrice).toBeGreaterThan(0)
  })
})
