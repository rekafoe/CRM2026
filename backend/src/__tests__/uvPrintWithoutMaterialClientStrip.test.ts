import express from 'express'
import request from 'supertest'
import { stripClientPrintWithoutMaterial } from '../modules/pricing/uvPrintWithoutMaterial'
import { PricingController } from '../modules/pricing/controllers/pricingController'
import { UnifiedPricingService } from '../modules/pricing/services/unifiedPricingService'
import { normalizeWebsiteItems } from '../modules/orders/utils/websiteOrderNormalize'

jest.mock('../modules/pricing/services/unifiedPricingService', () => ({
  UnifiedPricingService: {
    calculatePrice: jest.fn(),
  },
}))

const mockedCalculate = UnifiedPricingService.calculatePrice as jest.MockedFunction<
  typeof UnifiedPricingService.calculatePrice
>

describe('stripClientPrintWithoutMaterial', () => {
  it('removes flag from root, specifications and nested configuration', () => {
    const stripped = stripClientPrintWithoutMaterial({
      material_id: 42,
      print_without_material: true,
      specifications: { print_without_material: true, uv_print: { color: { enabled: true } } },
      configuration: { print_without_material: '1', size_id: 'anchor' },
    })
    expect(stripped.print_without_material).toBeUndefined()
    expect((stripped.specifications as Record<string, unknown>).print_without_material).toBeUndefined()
    expect((stripped.specifications as Record<string, unknown>).uv_print).toEqual({
      color: { enabled: true },
    })
    expect((stripped.configuration as Record<string, unknown>).print_without_material).toBeUndefined()
    expect((stripped.configuration as Record<string, unknown>).size_id).toBe('anchor')
    expect(stripped.material_id).toBe(42)
  })
})

describe('website normalize strips print_without_material', () => {
  it('does not persist client UV without-material flag into order params', () => {
    const [item] = normalizeWebsiteItems([
      {
        type: 'УФ',
        price: 10,
        quantity: 1,
        totalCost: 10,
        params: {
          productId: 55,
          print_without_material: true,
          specifications: {
            print_without_material: true,
            material_id: 42,
            uv_print: { color: { enabled: true, passes: 1 } },
          },
          configuration: { print_without_material: true },
        },
      },
    ])

    expect(item.params.print_without_material).toBeUndefined()
    expect((item.params.specifications as Record<string, unknown>).print_without_material).toBeUndefined()
    expect((item.params.specifications as Record<string, unknown>).material_id).toBe(42)
    expect((item.params.configuration as Record<string, unknown>).print_without_material).toBeUndefined()
  })
})

describe('PricingController.calculateProductPrice UV without-material gate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedCalculate.mockResolvedValue({
      finalPrice: 100,
      pricePerUnit: 1,
      materialCost: 55,
      operationsCost: 45,
      materials: [],
      operations: [],
      subtotal: 100,
      markup: 0,
      discountPercent: 0,
      discountAmount: 0,
      calculatedAt: new Date().toISOString(),
      calculationMethod: 'simplified',
      setupCosts: 0,
    } as any)
  })

  function app() {
    const server = express()
    server.use(express.json())
    server.post('/calculate', (req, res) => PricingController.calculateProductPrice(req, res))
    return server
  }

  it('strips print_without_material for anonymous calculate', async () => {
    await request(app())
      .post('/calculate')
      .send({
        productId: 1,
        quantity: 2,
        configuration: {
          size_id: 'anchor',
          material_id: 42,
          print_without_material: true,
          uv_print: { color: { enabled: true, passes: 1 } },
        },
      })
      .expect(200)

    expect(mockedCalculate).toHaveBeenCalledTimes(1)
    const config = mockedCalculate.mock.calls[0][1] as Record<string, unknown>
    expect(config.print_without_material).toBeUndefined()
    expect(config.material_id).toBe(42)
  })

  it('keeps print_without_material for CRM staff JWT', async () => {
    const server = express()
    server.use(express.json())
    server.post('/calculate', (req, res, next) => {
      ;(req as any).user = { id: 7, role: 'admin' }
      next()
    }, (req, res) => PricingController.calculateProductPrice(req, res))

    await request(server)
      .post('/calculate')
      .send({
        productId: 1,
        quantity: 2,
        configuration: {
          size_id: 'anchor',
          print_without_material: true,
          uv_print: { color: { enabled: true, passes: 1 } },
        },
      })
      .expect(200)

    const config = mockedCalculate.mock.calls[0][1] as Record<string, unknown>
    expect(config.print_without_material).toBe(true)
  })
})
