/**
 * After issue (status=7 and/or debt_closed_events), prepaid fields are sealed:
 * cash day uses prepaymentUpdatedAt + debt_closed remainder. Mutating /prepay,
 * clearing amount=0, or item add/update/delete sync that restamps prepaid
 * while debt_closed stays → double-count or vanished cash in the register.
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

/** Minimal db surface used by the debt_closed lookup (sqlite wrapper). */
type DebtClosedDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (sql: string, ...params: any[]) => Promise<any>
}

export async function orderHasDebtClosedEvent(db: DebtClosedDb, orderId: number): Promise<boolean> {
  try {
    const hasTable = !!(await db.get(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='debt_closed_events'",
    ))
    if (!hasTable) return false
    const row = (await db.get(
      'SELECT 1 as c FROM debt_closed_events WHERE order_id = ? LIMIT 1',
      orderId,
    )) as { c: number } | undefined
    return Boolean(row)
  } catch {
    return false
  }
}

/** True when prepaid must not be rewritten (issued and/or debt_closed present). */
export async function isOrderPrepaySealed(
  db: DebtClosedDb,
  orderId: number,
  status?: number | string | null,
): Promise<boolean> {
  let resolvedStatus = status
  if (resolvedStatus === undefined) {
    const row = (await db.get(
      'SELECT status FROM orders WHERE id = ?',
      orderId,
    )) as { status?: number | string | null } | undefined
    resolvedStatus = row?.status
  }
  if (Number(resolvedStatus) === 7) {
    return true
  }
  return planIssuedOrderPrepayBlock({
    status: resolvedStatus,
    hasDebtClosedEvent: await orderHasDebtClosedEvent(db, orderId),
  }).blocked
}