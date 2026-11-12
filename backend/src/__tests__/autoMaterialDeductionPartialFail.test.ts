import { AutoMaterialDeductionService } from '../modules/warehouse/services/autoMaterialDeductionService'
import { WarehouseTransactionService } from '../modules/warehouse/services/warehouseTransactionService'
import { getDb } from '../config/database'

jest.mock('../config/database', () => ({
  getDb: jest.fn(),
}))

jest.mock('../modules/warehouse/services/warehouseTransactionService', () => ({
  WarehouseTransactionService: {
    spendMaterial: jest.fn(),
  },
}))

describe('AutoMaterialDeductionService partial spend failure', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>
  const mockedSpend = WarehouseTransactionService.spendMaterial as jest.MockedFunction<
    typeof WarehouseTransactionService.spendMaterial
  >

  beforeEach(() => {
    jest.clearAllMocks()
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (_sql: string, id: number) => {
        if (id === 1) return { name: 'Бумага', quantity: 100, min_quantity: 0 }
        if (id === 2) return { name: 'Плёнка', quantity: 100, min_quantity: 0 }
        return null
      }),
    } as any)
  })

  it('ставит success=false если второе списание падает после успешного первого', async () => {
    mockedSpend
      .mockResolvedValueOnce({
        success: true,
        materialId: 1,
        oldQuantity: 100,
        newQuantity: 90,
        operation: { type: 'spend', materialId: 1, quantity: 10, reason: 'x' },
        timestamp: new Date().toISOString(),
      })
      .mockRejectedValueOnce(new Error('Недостаточно материала "Плёнка". Доступно: 0, требуется: 5'))

    const result = await AutoMaterialDeductionService.deductMaterialsForOrder(
      42,
      [
        {
          type: '1',
          params: {},
          quantity: 1,
          components: [
            { materialId: 1, qtyPerItem: 10 },
            { materialId: 2, qtyPerItem: 5 },
          ],
        },
      ],
    )

    expect(mockedSpend).toHaveBeenCalledTimes(2)
    expect(result.success).toBe(false)
    expect(result.deductedMaterials).toHaveLength(1)
    expect(result.deductedMaterials[0].materialId).toBe(1)
    expect(result.errors.some((e) => e.includes('Плёнка') || e.includes('ID 2'))).toBe(true)
  })

  it('не продолжает списание после первой ошибки', async () => {
    mockedSpend.mockRejectedValueOnce(new Error('DB locked'))

    const result = await AutoMaterialDeductionService.deductMaterialsForOrder(
      43,
      [
        {
          type: '1',
          params: {},
          quantity: 1,
          components: [
            { materialId: 1, qtyPerItem: 1 },
            { materialId: 2, qtyPerItem: 1 },
          ],
        },
      ],
    )

    expect(mockedSpend).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(result.deductedMaterials).toHaveLength(0)
  })
})
