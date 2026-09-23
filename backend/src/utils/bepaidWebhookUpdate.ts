import { isPaidPrepaymentStatus } from './reportOrderCash'

export type BePaidMappedStatus = 'paid' | 'failed' | 'pending'

export type BePaidWebhookStatusPlan =
  | { action: 'noop_keep_paid' }
  | { action: 'apply'; status: BePaidMappedStatus }

/**
 * How the BePaid checkout webhook should treat an incoming status relative to
 * the order's current prepaymentStatus.
 *
 * Confirmed paid/successful must never be downgraded by a later incomplete /
 * failed / pending notification (remainder-link abandonment, delayed pending,
 * expired second checkout). Downgrade drops the order out of cash reports
 * (countsAsPaidForCashReport requires paid/successful for online).
 */
export function planBePaidWebhookStatusUpdate(
  currentStatus: string | null | undefined,
  incoming: BePaidMappedStatus,
): BePaidWebhookStatusPlan {
  if (incoming !== 'paid' && isPaidPrepaymentStatus(currentStatus)) {
    return { action: 'noop_keep_paid' }
  }
  return { action: 'apply', status: incoming }
}
