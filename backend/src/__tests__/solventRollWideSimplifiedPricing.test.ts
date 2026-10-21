import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService'
import { getDb } from '../db'
import { RollWideM2PricingService } from '../modules/pricing/services/rollWideM2PricingService'

jest.mock('../db', () => ({
  getDb: jest.fn(),
}))

jest.mock('../modules/pricing/services/rollWideM2PricingService', () => ({
  RollWideM2PricingService: {
    loadRatesByTechnology: jest.fn(),
    calculate: jest.fn(),
    buildMissingRatesError: jest.fn(async (technologyCode: string) => {
      const err: Error & { status?: number } = new Error(`Missing roll_wide rates for ${technologyCode}`)
      err.status = 404
      return err
    }),
  },
}))

describe('simplified solvent print uses roll m2, not SRA3', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>
  const mockedLoadRates = RollWideM2PricingService.loadRatesByTechnology as jest.MockedFunction<
    typeof RollWideM2PricingService.loadRatesByTechnology
  >
  const mockedCalculate = RollWideM2PricingService.calculate as jest.MockedFunction<
    typeof RollWideM2PricingService.calculate
  >

  beforeEach(() => {
    jest.clearAllMocks()
    mockedLoadRates.mockResolvedValue({
      printPriceId: 4,
      technologyCode: 'inkjet_solvent',
      price_color_per_m2: 24,
      min_charge: 0,
      max_width_mm: 1200,
      max_height_mm: 0,
      supports_bw: false,
      m2PricingKind: 'roll_wide',
      tiers: [],
    })
    mockedCalculate.mockResolvedValue({
      printPrice: 40.8,
      pieceAreaM2: 1.7,
      totalM2: 1.7,
      minChargeApplied: false,
      ratePerM2: 24,
      quantity: 1,
      tier: null,
    })

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 7,
            name: 'Печать мобильных стендов (Roll-up)',
            calculator_type: 'simplified',
            product_type: 'universal',
          }
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                include_material_cost: true,
                use_layout: true,
                sizes: [
                  {
                    id: '85x200',
                    label: '85x200 см',
                    width_mm: 850,
                    height_mm: 2000,
                    allowed_material_ids: [11],
                    print_prices: [
                      {
                        technology_code: 'inkjet_solvent',
                        color_mode: 'color',
                        sides_mode: 'single',
                        tiers: [{ min_qty: 1, unit_price: 999 }],
                      },
                    ],
                    finishing: [],
                  },
                ],
              },
            }),
          }
        }
        if (query.includes('sheet_width, sheet_height FROM materials')) {
          return { sheet_width: 1100, sheet_height: null }
        }
        if (query.includes('sheet_price_single FROM materials')) {
          return { sheet_price_single: 6 }
        }
        if (query.includes('FROM materials m')) {
          return { name: 'Баннер матовый', density: null, paper_type_id: null }
        }
        if (query.includes('FROM price_types')) return null
        return null
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any)
  })

  it('не берёт листовой тариф 999 и не пишет предупреждение про печатный лист', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      7,
      {
        size_id: '85x200',
        material_id: 11,
        print_technology: 'inkjet_solvent',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        finishing: [],
      },
      1,
    )

    expect(mockedCalculate).toHaveBeenCalledWith(expect.objectContaining({
      technologyCode: 'inkjet_solvent',
      trimWidthMm: 850,
      trimHeightMm: 2000,
      quantity: 1,
    }))
    expect(result.printPrice).toBe(40.8)
    expect(result.layout?.sheetsNeeded).toBe(0)
    expect(result.layout?.metersNeeded).toBeGreaterThan(1)
    expect(result.materialPrice).toBeCloseTo(6 * Number(result.layout?.metersNeeded), 4)
    expect(result.warnings?.join(' ') ?? '').not.toContain('печатный лист')
  })
})
