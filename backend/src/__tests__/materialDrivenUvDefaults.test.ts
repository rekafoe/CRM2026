import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService'
import { getDb } from '../db'
import { MaterialPrintResolver } from '../modules/pricing/services/materialPrintResolver'
import { UvFlatbedPricingService } from '../modules/pricing/services/uvFlatbedPricingService'

jest.mock('../db', () => ({
  getDb: jest.fn(),
}))

jest.mock('../modules/pricing/services/materialPrintResolver', () => ({
  MaterialPrintResolver: {
    resolve: jest.fn(),
  },
}))

jest.mock('../modules/pricing/services/uvFlatbedPricingService', () => ({
  UvFlatbedPricingService: {
    calculate: jest.fn(async () => ({
      printPrice: 80,
      pieceAreaM2: 0.1,
      totalM2: 1,
      minChargeApplied: false,
      layers: [
        {
          layer: 'color',
          label: 'УФ-печать (цвет)',
          passes: 1,
          ratePerM2: 80,
          areaM2PerPiece: 0.1,
          quantity: 10,
          totalCost: 80,
        },
      ],
    })),
  },
}))

describe('material_driven UV default layers', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>
  const mockedResolve = MaterialPrintResolver.resolve as jest.MockedFunction<
    typeof MaterialPrintResolver.resolve
  >
  const mockedUvCalculate = UvFlatbedPricingService.calculate as jest.MockedFunction<
    typeof UvFlatbedPricingService.calculate
  >

  const materialId = 77

  const templateConfigData = {
    simplified: {
      material_driven_printing: true,
      use_layout: false,
      include_material_cost: false,
      // No uv_print template — CRM/website omit uv_print under material_driven.
      sizes: [
        {
          id: 1,
          label: '100×100',
          width_mm: 100,
          height_mm: 100,
          print_prices: [],
          allowed_material_ids: [materialId],
          finishing: [],
        },
      ],
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockedResolve.mockResolvedValue({
      usageContext: 'indoor',
      requestedMaterialId: materialId,
      materialTypeId: 3,
      materialKind: 'sheet',
      selectedMaterialId: materialId,
      selectedMaterialName: 'ПВХ 5мм',
      selectedMaterialWidthMm: 1220,
      selectedMaterialHeightMm: 2440,
      availableQuantity: 10,
      requiredQuantity: 0,
      stockSufficient: true,
      technologyCode: 'uv',
      technologyName: 'УФ-планшет',
      pricingMode: 'per_m2',
      m2PricingKind: 'uv_flatbed',
      warnings: [],
    })

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'УФ табличка',
            calculator_type: 'simplified',
            product_type: 'universal',
          }
        }
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) }
        }
        if (query.includes('FROM materials WHERE id = ?') && query.includes('printable_width')) {
          return { sheet_width: 1220, sheet_height: 2440, printable_width: null }
        }
        if (query.includes('sheet_width, sheet_height FROM materials')) {
          return { sheet_width: 1220, sheet_height: 2440 }
        }
        if (query.includes('FROM price_types WHERE key = ?')) {
          return null
        }
        return null
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any)
  })

  it('applies template color×1 when client omits uv_print on material_driven UV route', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 1,
        material_id: materialId,
        usage_context: 'indoor',
        // intentionally no uv_print / print_technology — resolver injects UV
      },
      10,
    )

    expect(mockedUvCalculate).toHaveBeenCalled()
    const uvArg = mockedUvCalculate.mock.calls[0][0]
    expect(uvArg.uvPrint).toEqual({ color: { enabled: true, passes: 1 } })
    expect(result.printPrice).toBe(80)
  })
})
