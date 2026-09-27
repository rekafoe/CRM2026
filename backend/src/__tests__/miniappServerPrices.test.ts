import { applyServerPricesToMiniappOrder } from '../services/miniappServerPrices'
import { OrderPricingService } from '../modules/orders/services/orderPricingService'
import { getDb } from '../config/database'

jest.mock('../config/database', () => ({
  getDb: jest.fn(),
}))

jest.mock('../modules/orders/services/orderPricingService', () => ({
  OrderPricingService: {
    recalculateOrderPrices: jest.fn(),
  },
}))

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

describe('applyServerPricesToMiniappOrder', () => {
  const getDbMock = getDb as jest.MockedFunction<typeof getDb>
  const recalcMock = OrderPricingService.recalculateOrderPrices as jest.MockedFunction<
    typeof OrderPricingService.recalculateOrderPrices
  >

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('clears client priceLockedByCalculator then recalculates server prices', async () => {
    const run = jest.fn(async () => undefined)
    const all = jest.fn(async () => [
      {
        id: 11,
        params: JSON.stringify({
          productId: 5,
          storedTotalCost: 0.01,
          priceLockedByCalculator: true,
        }),
      },
      {
        id: 12,
        params: JSON.stringify({ productId: 5, storedTotalCost: 12.5 }),
      },
    ])
    getDbMock.mockResolvedValue({ all, run } as any)
    recalcMock.mockResolvedValue({ updatedCount: 1, cartTotal: 42, groups: [] })

    await applyServerPricesToMiniappOrder(77)

    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(
      'UPDATE items SET params = ? WHERE id = ? AND orderId = ?',
      [
        JSON.stringify({ productId: 5, storedTotalCost: 0.01 }),
        11,
        77,
      ],
    )
    expect(recalcMock).toHaveBeenCalledWith(77)
  })
})
