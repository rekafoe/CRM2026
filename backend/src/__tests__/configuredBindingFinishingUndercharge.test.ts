import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService'
import { LayoutCalculationService } from '../modules/pricing/services/layoutCalculationService'
import { PricingServiceRepository } from '../modules/pricing/repositories/serviceRepository'
import { BindingPricingService } from '../modules/pricing/services/bindingPricingService'
import { getDb } from '../db'
import { getTableColumns } from '../utils/tableSchemaCache'

jest.mock('../db', () => ({
  getDb: jest.fn(),
}))

jest.mock('../utils/tableSchemaCache', () => ({
  getTableColumns: jest.fn(async () => new Set<string>()),
}))

jest.mock('../modules/pricing/repositories/serviceRepository', () => ({
  PricingServiceRepository: {
    listServiceTiers: jest.fn(),
  },
}))

jest.mock('../modules/pricing/services/bindingPricingService', () => ({
  BindingPricingService: {
    quoteBinding: jest.fn(),
  },
}))

const layoutMock = (itemsPerSheet: number) => ({
  fitsOnSheet: true,
  itemsPerSheet,
  sheetsNeeded: 100,
  wastePercentage: 0,
  recommendedSheetSize: { width: 320, height: 450 },
  layout: { rows: 1, cols: itemsPerSheet, actualItemsPerSheet: itemsPerSheet },
  cutsPerSheet: 0,
})

jest.mock('../modules/pricing/services/layoutCalculationService', () => ({
  LayoutCalculationService: {
    calculateLayout: jest.fn(() => layoutMock(1)),
    findOptimalSheetSize: jest.fn(() => layoutMock(1)),
  },
}))

/**
 * Regression: configured multi_page binding is billed outside the finishing loop
 * (filtered from effectiveFinishingToUse). Subtracting bindFromFinishing from
 * finishingPrice undercharged other finishing by the binding amount.
 */
describe('configured binding must not reduce other finishing', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>
  const mockedListTiers = PricingServiceRepository.listServiceTiers as jest.MockedFunction<
    typeof PricingServiceRepository.listServiceTiers
  >
  const mockedQuoteBinding = BindingPricingService.quoteBinding as jest.MockedFunction<
    typeof BindingPricingService.quoteBinding
  >

  const laminateServiceId = 55
  const bindingServiceId = 77
  const laminateRate = 30
  const bindingTotal = 50
  const printUnitPrice = 2
  const quantity = 100
  /** 16 pages × 100 qty × 2 BYN/лист (itemsPerSheet=1, single) */
  const printTotal = 3200

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getTableColumns as jest.Mock).mockResolvedValue(new Set<string>())
    ;(LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layoutMock(1))
    ;(LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layoutMock(1))
    mockedListTiers.mockResolvedValue([{ minQuantity: 1, rate: laminateRate } as any])
    mockedQuoteBinding.mockResolvedValue({
      serviceId: bindingServiceId,
      serviceName: 'Пружина',
      priceUnit: 'per_item',
      unitPrice: 0.5,
      units: quantity,
      total: bindingTotal,
    })

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'Брошюра',
            calculator_type: 'simplified',
            product_type: 'multi_page',
          }
        }
        if (query.includes('FROM product_template_configs')) {
          return {
            config_data: JSON.stringify({
              simplified: {
                include_material_cost: false,
                multiPageStructure: {
                  cover: { mode: 'self', qty_per_item: 1, print: { sides_mode: 'single' } },
                  innerBlock: { pagesSource: 'parameter' },
                  binding: { service_id: bindingServiceId, units_per_item: 1 },
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
                        tiers: [{ min_qty: 1, unit_price: printUnitPrice }],
                      },
                    ],
                    material_prices: [],
                    finishing: [],
                  },
                ],
              },
            }),
          }
        }
        if (query.includes('FROM price_types')) return null
        if (query.includes('FROM print_prices')) return null
        return null
      }),
      all: jest.fn(async (query: string) => {
        if (query.includes('FROM post_processing_services')) {
          return [
            {
              id: laminateServiceId,
              name: 'Ламинация',
              operation_type: 'laminate',
              price_unit: 'per_item',
              min_quantity: 1,
              max_quantity: null,
              parameters: null,
            },
          ]
        }
        return []
      }),
      run: jest.fn(),
    } as any)
  })

  it('keeps full laminate + binding when multiPageStructure.binding is configured', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 16 as any,
        finishing: [{ service_id: laminateServiceId, units_per_item: 1 }],
      } as any,
      quantity,
    )

    expect(mockedQuoteBinding).toHaveBeenCalled()
    const laminate = result.finishingDetails?.find((d) => d.service_id === laminateServiceId)
    expect(laminate?.priceForQuantity).toBe(laminateRate * quantity)
    expect(result.breakdown?.bindingPrice).toBe(bindingTotal)
    expect(result.breakdown?.otherFinishingPrice).toBe(laminateRate * quantity)
    // Bug was: otherFinishingPrice = finishingPrice - bindingTotal → undercharge by bindingTotal
    expect(result.finalPrice).toBe(printTotal + laminateRate * quantity + bindingTotal)
  })
})
