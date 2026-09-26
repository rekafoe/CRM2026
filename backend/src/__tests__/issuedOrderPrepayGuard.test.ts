import {
  ISSUED_ORDER_PREPAY_BLOCK_MESSAGE,
  isOrderPrepaySealed,
  planIssuedOrderPrepayBlock,
} from '../utils/issuedOrderPrepayGuard'

describe('planIssuedOrderPrepayBlock', () => {
  it('blocks status=7 (issued)', () => {
    expect(planIssuedOrderPrepayBlock({ status: 7 })).toEqual({
      blocked: true,
      reason: 'status_issued',
    })
  })

  it('blocks when debt_closed_events exist even if status was changed', () => {
    expect(
      planIssuedOrderPrepayBlock({ status: 3, hasDebtClosedEvent: true }),
    ).toEqual({ blocked: true, reason: 'debt_closed' })
  })

  it('allows open orders without debt_closed', () => {
    expect(
      planIssuedOrderPrepayBlock({ status: 2, hasDebtClosedEvent: false }),
    ).toEqual({ blocked: false })
  })

  it('exposes a stable operator-facing message', () => {
    expect(ISSUED_ORDER_PREPAY_BLOCK_MESSAGE).toMatch(/выдан/i)
  })
})

describe('isOrderPrepaySealed', () => {
  it('returns true for status=7 without querying debt_closed', async () => {
    const db = {
      get: jest.fn(async () => {
        throw new Error('should not query when status is issued')
      }),
    }
    await expect(isOrderPrepaySealed(db, 10, 7)).resolves.toBe(true)
    expect(db.get).not.toHaveBeenCalled()
  })

  it('loads status and debt_closed when status omitted', async () => {
    const db = {
      get: jest.fn(async (sql: string) => {
        if (sql.includes('FROM orders')) return { status: 3 }
        if (sql.includes('sqlite_master')) return { 1: 1 }
        if (sql.includes('debt_closed_events')) return { c: 1 }
        return undefined
      }),
    }
    await expect(isOrderPrepaySealed(db, 42)).resolves.toBe(true)
  })

  it('returns false for open order without debt_closed', async () => {
    const db = {
      get: jest.fn(async (sql: string) => {
        if (sql.includes('sqlite_master')) return { 1: 1 }
        if (sql.includes('debt_closed_events')) return undefined
        return undefined
      }),
    }
    await expect(isOrderPrepaySealed(db, 5, 2)).resolves.toBe(false)
  })
})
