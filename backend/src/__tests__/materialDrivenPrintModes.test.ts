import { getDb } from '../db'
import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService'
import { MaterialPrintResolver } from '../modules/pricing/services/materialPrintResolver'
import { LayoutCalculationService } from '../modules/pricing/services/layoutCalculationService'

jest.mock('../db', () => ({
  getDb: jest.fn(),
}))

jest.mock('../modules/pricing/services/materialPrintResolver', () => ({
  MaterialPrintResolver: {
    resolve: jest.fn(),
  },
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
    findOptimalSheetSize: jest.fn(() => ({
      fitsOnSheet: true,
      itemsPerSheet: 1,
      sheetsNeeded: 10,
      wastePercentage: 0,
      recommendedSheetSize: { width: 320, height: 450 },
      layout: { rows: 1, cols: 1, actualItemsPerSheet: 1 },
      cutsPerSheet: 2,
    })),
  },
}))

describe('material_driven_printing color/sides selection', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>
  const resolveMock = MaterialPrintResolver.resolve as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    ;(LayoutCalculationService.calculateLayout as jest.Mock).mockClear()

    resolveMock.mockResolvedValue({
      usageContext: 'indoor',
      requestedMaterialId: 10,
      materialTypeId: 1,
      materialKind: 'sheet',
      selectedMaterialId: 10,
      selectedMaterialName: 'SRA3',
      selectedMaterialWidthMm: 320,
      selectedMaterialHeightMm: 450,
      availableQuantity: 100,
      requiredQuantity: 0,
      stockSufficient: true,
      technologyCode: 'laser_prof',
      technologyName: 'Лазер',
      pricingMode: 'per_sheet',
      m2PricingKind: null,
      warnings: [],
    })

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'Карточки',
            calculator_type: 'simplified',
            product_type: 'cards',
          }
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                material_driven_printing: true,
                include_material_cost: false,
                sizes: [
                  {
                    id: '90x50',
                    label: '90×50',
                    width_mm: 90,
                    height_mm: 50,
                    min_qty: 1,
                    allowed_material_ids: [10],
                    print_prices: [
                      {
                        technology_code: 'laser_prof',
                        color_mode: 'color',
                        sides_mode: 'single',
                        tiers: [{ min_qty: 1, unit_price: 0.5 }],
                      },
                      {
                        technology_code: 'laser_prof',
                        color_mode: 'color',
                        sides_mode: 'duplex',
                        tiers: [{ min_qty: 1, unit_price: 0.9 }],
                      },
                    ],
                  },
                ],
              },
            }),
          }
        }
        if (query.includes('FROM materials WHERE id = ?')) {
          return { sheet_width: 320, sheet_height: 450, sheet_price_single: 0.1, name: 'SRA3', density: 300 }
        }
        return null
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any)
  })

  it('rejects requested duplex when only single exists for resolved technology', async () => {
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return { id: 1, name: 'Карточки', calculator_type: 'simplified', product_type: 'cards' }
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                material_driven_printing: true,
                include_material_cost: false,
                sizes: [
                  {
                    id: '90x50',
                    label: '90×50',
                    width_mm: 90,
                    height_mm: 50,
                    min_qty: 1,
                    allowed_material_ids: [10],
                    print_prices: [
                      {
                        technology_code: 'laser_prof',
                        color_mode: 'color',
                        sides_mode: 'single',
                        tiers: [{ min_qty: 1, unit_price: 0.5 }],
                      },
                    ],
                  },
                ],
              },
            }),
          }
        }
        if (query.includes('FROM materials WHERE id = ?')) {
          return { sheet_width: 320, sheet_height: 450, sheet_price_single: 0.1, name: 'SRA3', density: 300 }
        }
        return null
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any)

    await expect(
      SimplifiedPricingService.calculatePrice(1, {
        size_id: '90x50',
        material_id: 10,
        print_color_mode: 'color',
        print_sides_mode: 'duplex',
      }, 10),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/нет тарифа печати color\/duplex/i),
      status: 422,
    })
  })

  it('keeps requested duplex instead of falling back to single', async () => {
    const result = await SimplifiedPricingService.calculatePrice(1, {
      size_id: '90x50',
      material_id: 10,
      print_color_mode: 'color',
      print_sides_mode: 'duplex',
    }, 10)

    expect(result.selectedPrint).toMatchObject({
      technology_code: 'laser_prof',
      color_mode: 'color',
      sides_mode: 'duplex',
    })
    expect(result.printPrice).toBeGreaterThan(0)
  })
})
