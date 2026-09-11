/**
 * When CRM changes order line totals, offline prepaid amounts may be resized to stay
 * in sync with the new order total. That must NEVER invent a payment from unpaid /
 * DEFAULT-online orders, and must NOT rewrite prepaymentUpdatedAt (cash day).
 */

const EPS = 0.005

export type ItemMutationPrepaymentPlan =
  | { action: 'none' }
  | {
      action: 'resize_offline_amount'
      nextAmount: number
      /** Keep existing payment day — callers must not SET prepaymentUpdatedAt. */
      preservePrepaymentUpdatedAt: true
    }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * addItem: only resize when the order was already fully prepaid offline for the
 * previous total. Do not treat SQLite DEFAULT paymentMethod='online' or unpaid
 * (!hasPrepayment) as auto-pay.
 */
export function planAddItemPrepaymentUpdate(input: {
  paymentMethod: string | null | undefined
  prepaymentAmount: number
  oldTotal: number
  newTotal: number
}): ItemMutationPrepaymentPlan {
  const method = String(input.paymentMethod ?? '').trim().toLowerCase()
  if (method !== 'offline') return { action: 'none' }
  const prepay = Number(input.prepaymentAmount) || 0
  const oldTotal = round2(Number(input.oldTotal) || 0)
  const newTotal = round2(Number(input.newTotal) || 0)
  if (!(newTotal > 0)) return { action: 'none' }
  if (Math.abs(prepay - oldTotal) >= EPS) return { action: 'none' }
  if (Math.abs(prepay - newTotal) < EPS) return { action: 'none' }
  return {
    action: 'resize_offline_amount',
    nextAmount: newTotal,
    preservePrepaymentUpdatedAt: true,
  }
}

/** updateItem qty/price: same offline in-sync resize, no stamp rewrite. */
export function planUpdateItemPrepaymentUpdate(input: {
  paymentMethod: string | null | undefined
  prepaymentAmount: number
  oldTotal: number
  newTotal: number
}): ItemMutationPrepaymentPlan {
  return planAddItemPrepaymentUpdate(input)
}

/**
 * deleteItem: shrink offline prepayment when it exceeded the new total.
 * Preserve payment day (do not stamp now).
 */
export function planDeleteItemPrepaymentUpdate(input: {
  paymentMethod: string | null | undefined
  prepaymentAmount: number
  newTotal: number
}): ItemMutationPrepaymentPlan {
  const method = String(input.paymentMethod ?? '').trim().toLowerCase()
  if (method !== 'offline') return { action: 'none' }
  const prepay = Number(input.prepaymentAmount) || 0
  const newTotal = round2(Math.max(0, Number(input.newTotal) || 0))
  if (!(prepay > newTotal + EPS)) return { action: 'none' }
  return {
    action: 'resize_offline_amount',
    nextAmount: newTotal,
    preservePrepaymentUpdatedAt: true,
  }
}

/** Discount change on a fully prepaid offline order. */
export function planDiscountPrepaymentUpdate(input: {
  paymentMethod: string | null | undefined
  prepaymentAmount: number
  oldTotal: number
  newTotal: number
}): ItemMutationPrepaymentPlan {
  return planAddItemPrepaymentUpdate(input)
}
