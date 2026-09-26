import {
  ISSUED_ORDER_PREPAY_BLOCK_MESSAGE,
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
