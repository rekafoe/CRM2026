import type { Order } from '../types';
import { isCompletedOrderStatusId, isWaitingOrder } from '../hooks/useOrderStatuses';
import { collectedPrepaymentAmount } from './numberInput';

export const WEBSITE_WAITING_PAYMENT_BLOCK =
  'Нельзя удалить позицию: по заказу уже проведена оплата. Касса и платёж останутся на старый состав.';

export const WEBSITE_WAITING_ISSUE_BLOCK =
  'Нельзя удалить позицию: по заказу уже есть выдача или проведённый документ.';

type StatusRef = { id: number; name: string; code?: string | null };

export type WebsiteWaitingLineAccess =
  | { kind: 'other' }
  | { kind: 'open' }
  | { kind: 'blocked'; reason: string };

/**
 * Заказ с сайта в статусе «Ожидает»: менеджер может удалить строку и добавить новую,
 * пока нет проведённой оплаты и выдачи. Отменённый заказ остаётся только для просмотра.
 */
export function websiteWaitingLineAccess(
  order: Pick<
    Order,
    | 'source'
    | 'status'
    | 'prepaymentAmount'
    | 'prepaymentStatus'
    | 'paymentMethod'
    | 'is_cancelled'
    | 'issued_by_me'
  >,
  statuses?: StatusRef[] | null,
): WebsiteWaitingLineAccess {
  if (order.source !== 'website' || order.is_cancelled === 1) return { kind: 'other' };
  if (!isWaitingOrder(order, statuses)) return { kind: 'other' };
  if (collectedPrepaymentAmount(order.prepaymentAmount, order.prepaymentStatus, order.paymentMethod) > 0) {
    return { kind: 'blocked', reason: WEBSITE_WAITING_PAYMENT_BLOCK };
  }
  if (isCompletedOrderStatusId(Number(order.status)) || order.issued_by_me === true || order.issued_by_me === 1) {
    return { kind: 'blocked', reason: WEBSITE_WAITING_ISSUE_BLOCK };
  }
  return { kind: 'open' };
}
