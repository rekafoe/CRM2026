import type { Order } from '../types';
import { isCompletedOrderStatusId, isWaitingOrder } from '../hooks/useOrderStatuses';
import { collectedPrepaymentAmount, parseNumberFlexible } from './numberInput';

export const WEBSITE_WAITING_PAYMENT_BLOCK =
  'Нельзя удалить позицию: по заказу уже проведена оплата. Касса и платёж останутся на старый состав.';

export const WEBSITE_WAITING_ISSUE_BLOCK =
  'Нельзя удалить позицию: по заказу уже есть выдача или проведённый документ.';

type StatusRef = { id: number; name: string; code?: string | null };

export type WebsiteWaitingLineAccess =
  | { kind: 'other' }
  | { kind: 'open' }
  | { kind: 'blocked'; reason: string };

type LineOrder = Pick<
  Order,
  | 'source'
  | 'status'
  | 'prepaymentAmount'
  | 'prepaymentStatus'
  | 'paymentMethod'
  | 'is_cancelled'
  | 'issued_by_me'
>;

/** BePaid зачислил деньги. Сумму не откатываем, состав менять можно. */
export function isBepaidSettledPayment(order: Pick<LineOrder, 'prepaymentAmount' | 'prepaymentStatus' | 'paymentMethod'>): boolean {
  if (parseNumberFlexible(order.prepaymentAmount ?? 0) <= 0) return false;
  const status = String(order.prepaymentStatus ?? '').trim().toLowerCase();
  const method = String(order.paymentMethod ?? '').trim().toLowerCase();
  return method === 'online' && (status === 'paid' || status === 'successful');
}

/**
 * Заказ с сайта: удалить строку и добавить новую можно в «Ожидает» без кассовой оплаты
 * и после BePaid paid/successful на любом статусе. Выдача и отмена остаются закрытыми.
 * Офлайн и bank в «Ожидает» по-прежнему без удаления.
 */
export function websiteWaitingLineAccess(
  order: LineOrder,
  statuses?: StatusRef[] | null,
): WebsiteWaitingLineAccess {
  if (order.source !== 'website' || order.is_cancelled === 1) return { kind: 'other' };
  if (isCompletedOrderStatusId(Number(order.status)) || order.issued_by_me === true || order.issued_by_me === 1) {
    return { kind: 'blocked', reason: WEBSITE_WAITING_ISSUE_BLOCK };
  }
  if (isBepaidSettledPayment(order)) return { kind: 'open' };
  if (!isWaitingOrder(order, statuses)) return { kind: 'other' };
  if (collectedPrepaymentAmount(order.prepaymentAmount, order.prepaymentStatus, order.paymentMethod) > 0) {
    return { kind: 'blocked', reason: WEBSITE_WAITING_PAYMENT_BLOCK };
  }
  return { kind: 'open' };
}
