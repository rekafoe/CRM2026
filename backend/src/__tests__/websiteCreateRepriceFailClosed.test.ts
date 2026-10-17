/**
 * Website/mini_app create: если серверный reprice падает (мин. тираж и т.п.),
 * клиентский totalCost раньше оставался в заказе — underpay.
 * Теперь createOrderWithAutoDeduction fail-closed.
 */

jest.mock('../modules/pricing/services/pricingGroupService', () => {
  const actual = jest.requireActual('../modules/pricing/services/pricingGroupService')
  return {
    ...actual,
    isSimplifiedProduct: jest.fn(async () => true),
    quoteLines: jest.fn(),
  }
})

jest.mock('../modules/warehouse/services/autoMaterialDeductionService', () => ({
  AutoMaterialDeductionService: {
    deductMaterialsForOrder: jest.fn(async () => ({
      success: true,
      deductedMaterials: [],
      warnings: [],
      errors: [],
    })),
    cancelDeduction: jest.fn(async () => true),
  },
}))

import { initDB, getDb } from '../config/database'
import { OrderService } from '../modules/orders/services/orderService'
import { quoteLines } from '../modules/pricing/services/pricingGroupService'
import { AutoMaterialDeductionService } from '../modules/warehouse/services/autoMaterialDeductionService'

describe('website create fail-closed when server reprice errors', () => {
  const mockedQuote = quoteLines as jest.MockedFunction<typeof quoteLines>
  const mockedCancel = AutoMaterialDeductionService.cancelDeduction as jest.MockedFunction<
    typeof AutoMaterialDeductionService.cancelDeduction
  >

  beforeAll(async () => {
    await initDB()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockedCancel.mockResolvedValue(true)
  })

  it('soft-cancels and restores stock when quoteLines returns line error', async () => {
    const db = await getDb()
    await db.run(
      `INSERT OR IGNORE INTO order_statuses (name, code, sort_order) VALUES ('Ожидает', 'waiting', 1)`,
    )
    await db.run(
      `INSERT OR IGNORE INTO order_statuses (name, code, sort_order) VALUES ('Отменён', 'cancelled', 99)`,
    )

    mockedQuote.mockImplementation(async (lines) => ({
      lines: lines.map((line) => ({
        lineId: line.lineId,
        productId: line.productId,
        quantity: line.quantity,
        finalPrice: 0,
        pricePerUnit: 0,
        sheetsNeeded: 1,
        groupKey: '1|laser_prof|color|single',
        groupTotalSheets: 1,
        tierMinQty: null,
        pricingMeta: {
          groupKey: '1|laser_prof|color|single',
          groupTotalSheets: 1,
          tierMinQty: null,
          sheetsNeeded: 1,
        },
        error: 'Тираж для размера "A6" должен быть не меньше 100',
      })),
      groups: [],
      cartTotal: 0,
    }))

    let thrown: { code?: string; message?: string } | null = null
    try {
      await OrderService.createOrderWithAutoDeduction({
        customerName: 'Test',
        customerPhone: '+375291111111',
        source: 'website',
        paymentMethod: 'online',
        items: [
          {
            type: '10',
            price: 0.01,
            quantity: 2,
            totalCost: 0.01,
            params: {
              productId: 10,
              specifications: {
                material_id: 1,
                print_technology: 'laser_prof',
                print_color_mode: 'color',
                print_sides_mode: 'single',
                size_id: 'a6',
              },
            },
          },
        ],
      } as any)
    } catch (e: any) {
      thrown = e
    }

    expect(thrown?.code).toBe('ORDER_REPRICE_FAILED')
    expect(String(thrown?.message || '')).toContain('не меньше 100')
    expect(mockedCancel).toHaveBeenCalled()

    const lastOrder = await db.get<{ id: number; is_cancelled?: number }>(
      `SELECT id, is_cancelled FROM orders ORDER BY id DESC LIMIT 1`,
    )
    expect(Number(lastOrder?.is_cancelled)).toBe(1)
  })
})
