jest.mock('../modules/warehouse/services/materialTransactionService', () => ({
  MaterialTransactionService: {
    addInTransaction: jest.fn(),
  },
}))

import { MaterialTransactionService } from '../modules/warehouse/services/materialTransactionService'
import { releaseItemReservationsOnDelete } from '../modules/orders/services/orderItemReservationRelease'

const mockedAddInTransaction = MaterialTransactionService.addInTransaction as jest.MockedFunction<
  typeof MaterialTransactionService.addInTransaction
>

type MemReservation = {
  id: number
  material_id: number
  order_id: number
  quantity_reserved: number
  status: string
}

function createMemDb(reservations: MemReservation[]) {
  return {
    async get<T>(sql: string, params?: unknown[] | unknown): Promise<T | undefined> {
      const args = Array.isArray(params) ? params : params === undefined ? [] : [params]
      if (sql.includes('FROM material_reservations WHERE id = ?')) {
        const id = Number(args[0])
        return reservations.find((r) => r.id === id) as T | undefined
      }
      return undefined
    },
    async run(sql: string, ...params: unknown[]) {
      const flat = params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params
      if (sql.includes("SET status = 'cancelled'")) {
        const id = Number(flat[0])
        const row = reservations.find((r) => r.id === id)
        if (row) row.status = 'cancelled'
        return { changes: row ? 1 : 0 }
      }
      return { changes: 0 }
    },
  }
}

describe('releaseItemReservationsOnDelete', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedAddInTransaction.mockResolvedValue({ oldQuantity: 0, newQuantity: 0 })
  })

  it('cancels active holds without restoring stock', async () => {
    const reservations: MemReservation[] = [
      {
        id: 50,
        material_id: 10,
        order_id: 7,
        quantity_reserved: 100,
        status: 'active',
      },
    ]
    const db = createMemDb(reservations)

    const result = await releaseItemReservationsOnDelete(db as any, {
      orderId: 7,
      reservationIds: [50],
    })

    expect(result).toEqual({ cancelled: 1, restored: 0 })
    expect(reservations[0].status).toBe('cancelled')
    expect(mockedAddInTransaction).not.toHaveBeenCalled()
  })

  it('restores stock for fulfilled reservations then cancels', async () => {
    const reservations: MemReservation[] = [
      {
        id: 51,
        material_id: 10,
        order_id: 7,
        quantity_reserved: 100,
        status: 'fulfilled',
      },
    ]
    const db = createMemDb(reservations)

    const result = await releaseItemReservationsOnDelete(db as any, {
      orderId: 7,
      reservationIds: [51],
      userId: 3,
      reason: 'order delete item',
    })

    expect(result).toEqual({ cancelled: 1, restored: 1 })
    expect(reservations[0].status).toBe('cancelled')
    expect(mockedAddInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        materialId: 10,
        quantity: 100,
        reason: 'order delete item',
        orderId: 7,
        userId: 3,
      }),
    )
  })

  it('ignores already cancelled and missing ids', async () => {
    const reservations: MemReservation[] = [
      {
        id: 52,
        material_id: 10,
        order_id: 7,
        quantity_reserved: 10,
        status: 'cancelled',
      },
    ]
    const db = createMemDb(reservations)

    const result = await releaseItemReservationsOnDelete(db as any, {
      orderId: 7,
      reservationIds: [52, 999],
    })

    expect(result).toEqual({ cancelled: 0, restored: 0 })
    expect(mockedAddInTransaction).not.toHaveBeenCalled()
  })
})
