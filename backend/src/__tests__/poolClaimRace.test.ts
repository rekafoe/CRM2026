/**
 * Pool «Взять»: claim must refuse when another operator already holds userId.
 * Uses a minimal sqlite mock around OrderService.reassignOrderByNumber.
 */

jest.mock('../config/database', () => ({
  getDb: jest.fn(),
}))

jest.mock('../utils/tableSchemaCache', () => ({
  hasColumn: jest.fn(async (table: string, column: string) => {
    if (table === 'orders' && (column === 'responsible_user_id' || column === 'updated_at')) return true
    if (table === 'photo_orders' && column === 'userId') return true
    return false
  }),
}))

import { getDb } from '../config/database'
import { OrderService } from '../modules/orders/services/orderService'

describe('OrderService.reassignOrderByNumber pool claim race', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(OrderService as any, 'recordOrderActivity').mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('rejects a concurrent claim when userId was taken between SELECT and UPDATE', async () => {
    const run = jest.fn(async (sql: string) => {
      if (String(sql).includes('userId IS NULL')) {
        return { changes: 0 }
      }
      return { changes: 1 }
    })
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (sql: string) => {
        if (String(sql).includes('FROM orders WHERE number')) {
          return { id: 42, status: 0, userId: null }
        }
        return null
      }),
      all: jest.fn(async () => []),
      run,
    } as any)

    await expect(OrderService.reassignOrderByNumber('ORD-42', 7, 7)).rejects.toThrow(
      /уже взят другим сотрудником/,
    )

    expect(run).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE id = \? AND userId IS NULL/),
      expect.arrayContaining([7, 42]),
    )
  })

  it('allows reassignment when order already has a responsible', async () => {
    const run = jest.fn(async () => ({ changes: 1 }))
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (sql: string) => {
        if (String(sql).includes('FROM orders WHERE number')) {
          return { id: 42, status: 0, userId: 3 }
        }
        return null
      }),
      all: jest.fn(async () => []),
      run,
    } as any)

    const result = await OrderService.reassignOrderByNumber('ORD-42', 9, 1)
    expect(result).toEqual({ id: 42, userId: 9 })
    const calls = run.mock.calls as unknown as Array<[string, unknown]>
    const sql = String(calls[0]?.[0] ?? '')
    expect(sql).toMatch(/WHERE id = \?$/)
    expect(sql).not.toMatch(/userId IS NULL/)
    expect(calls[0]?.[1]).toEqual(expect.arrayContaining([9, 42]))
  })
})
