/**
 * After issue (status=7 and/or debt_closed_events), prepaid fields are sealed:
 * cash day uses prepaymentUpdatedAt + debt_closed remainder. Mutating /prepay
 * or clearing amount=0 restamps or wipes money while debt_closed stays →
 * double-count or vanished cash in the register.
 */

export type IssuedOrderPrepayBlockReason = 'status_issued' | 'debt_closed'

export function planIssuedOrderPrepayBlock(input: {
  status?: number | string | null
  hasDebtClosedEvent?: boolean
}): { blocked: false } | { blocked: true; reason: IssuedOrderPrepayBlockReason } {
  if (Number(input.status) === 7) {
    return { blocked: true, reason: 'status_issued' }
  }
  if (input.hasDebtClosedEvent === true) {
    return { blocked: true, reason: 'debt_closed' }
  }
  return { blocked: false }
}

export const ISSUED_ORDER_PREPAY_BLOCK_MESSAGE =
  'Нельзя менять предоплату у выданного заказа. Сначала отмените выдачу или создайте корректировку отдельно.'
