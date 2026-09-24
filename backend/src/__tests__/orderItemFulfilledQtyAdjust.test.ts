jest.mock('../modules/warehouse/services/materialTransactionService', () => ({
  MaterialTransactionService: {
    addInTransaction: jest.fn(),
    spendInTransaction: jest.fn(),
  },
}))

import { MaterialTransactionService } from '../modules/warehouse/services/materialTransactionService'
import {
  adjustFulfilledReservationsForQuantityChange,
  computeRequiredQuantityForReservation,
} from '../modules/orders/services/orderItemFulfilledQtyAdjust'

const mockedAdd = MaterialTransactionService.addInTransaction as jest.MockedFunction<
  typeof MaterialTransactionService.addInTransaction
>
const mockedSpend = MaterialTransactionService.spendInTransaction as jest.MockedFunction<
  typeof MaterialTransactionService.spendInTransaction
>

type MemReservation = {
  id: number
  material_id: number
  quantity_reserved: number
  status: string
}

type MemMaterial = { id: number; unit?: string | null }

function createMemDb(seed: {
  materials: MemMaterial[]
  reservations: MemReservation[]
}) {
  const materials = seed.materials.map((m) => ({ ...m }))
  const reservations = seed.reservations.map((r) => ({ ...r }))

  return {
    async get<T>(sql: string, params?: unknown[] | unknown): Promise<T | undefined> {
      const args = Array.isArray(params) ? params : params === undefined ? [] : [params]
      if (sql.includes('FROM material_reservations WHERE id = ?')) {
        const id = Number(args[0])
        return reservations.find((r) => r.id === id) as T | undefined
      }
      return undefined
    },
    async all<T>(sql: string, params?: unknown[] | unknown): Promise<T[]> {
      const args = Array.isArray(params) ? params : params === undefined ? [] : [params]
      if (sql.includes('FROM material_reservations') && sql.includes('WHERE id IN')) {
        const ids = new Set(args.map(Number))
        return reservations.filter((r) => ids.has(r.id)) as T[]
      }
      if (sql.includes('FROM materials WHERE id IN')) {
        const ids = new Set(args.map(Number))
        return materials.filter((m) => ids.has(m.id)) as T[]
      }
      return []
    },
    async run(sql: string, ...params: unknown[]) {
      const flat =
        params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params
      if (sql.includes('SET quantity_reserved = ?')) {
        const [qty, id] = flat
        const row = reservations.find((r) => r.id === Number(id))
        if (row) row.quantity_reserved = Number(qty)
        return { changes: row ? 1 : 0 }
      }
      return { changes: 0 }
    },
    _reservations: reservations,
  }
}

describe('orderItemFulfilledQtyAdjust', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedAdd.mockResolvedValue({ oldQuantity: 0, newQuantity: 0 })
    mockedSpend.mockResolvedValue({ oldQuantity: 0, newQuantity: 0 })
  })

  it('computeRequiredQuantityForReservation rounds meters, ceils sheets', () => {
    expect(computeRequiredQuantityForReservation(1.25, 2, 'пог.м')).toBe(2.5)
    expect(computeRequiredQuantityForReservation(1.2, 3, 'лист')).toBe(4)
  })

  it('returns false for active holds (caller keeps reserve/cancel path)', async () => {
    const db = createMemDb({
      materials: [{ id: 10, unit: 'лист' }],
      reservations: [
        { id: 50, material_id: 10, quantity_reserved: 100, status: 'active' },
      ],
    })

    const adjusted = await adjustFulfilledReservationsForQuantityChange(db as any, {
      orderId: 7,
      components: [{ materialId: 10, qtyPerItem: 1, reservationId: 50 }],
      oldQuantity: 100,
      newQuantity: 40,
    })

    expect(adjusted).toBe(false)
    expect(mockedAdd).not.toHaveBeenCalled()
    expect(mockedSpend).not.toHaveBeenCalled()
  })

  it('restores stock when decreasing qty after fulfilled (Принят в работу)', async () => {
    const db = createMemDb({
      materials: [{ id: 10, unit: 'лист' }],
      reservations: [
        { id: 51, material_id: 10, quantity_reserved: 100, status: 'fulfilled' },
      ],
    })

    const adjusted = await adjustFulfilledReservationsForQuantityChange(db as any, {
      orderId: 7,
      components: [{ materialId: 10, qtyPerItem: 1, reservationId: 51 }],
      oldQuantity: 100,
      newQuantity: 40,
      userId: 3,
    })

    expect(adjusted).toBe(true)
    expect(mockedAdd).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        materialId: 10,
        quantity: 60,
        reason: 'order update qty - (fulfilled)',
        orderId: 7,
        userId: 3,
      }),
    )
    expect(mockedSpend).not.toHaveBeenCalled()
    expect(db._reservations[0].quantity_reserved).toBe(40)
  })

  it('spends stock when increasing qty after fulfilled', async () => {
    const db = createMemDb({
      materials: [{ id: 10, unit: 'лист' }],
      reservations: [
        { id: 52, material_id: 10, quantity_reserved: 40, status: 'fulfilled' },
      ],
    })

    const adjusted = await adjustFulfilledReservationsForQuantityChange(db as any, {
      orderId: 7,
      components: [{ materialId: 10, qtyPerItem: 1, reservationId: 52 }],
      oldQuantity: 40,
      newQuantity: 55,
      userId: 3,
    })

    expect(adjusted).toBe(true)
    expect(mockedSpend).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        materialId: 10,
        quantity: 15,
        reason: 'order update qty + (fulfilled)',
        orderId: 7,
        userId: 3,
      }),
    )
    expect(mockedAdd).not.toHaveBeenCalled()
    expect(db._reservations[0].quantity_reserved).toBe(55)
  })
})
