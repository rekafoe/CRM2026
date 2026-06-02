import type { Order } from '../types';

export type OrderAmountsView = {
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  prepayment: number;
  debt: number;
};

const zero: OrderAmountsView = {
  subtotal: 0,
  discountPercent: 0,
  discountAmount: 0,
  total: 0,
  prepayment: 0,
  debt: 0,
};

/**
 * Суммы заказа с API (бэкенд attachAmountsToOrder).
 * Фронт не пересчитывает позиции — только отображение.
 */
export function getOrderAmounts(
  order: Pick<
    Order,
    | 'subtotal'
    | 'discountAmount'
    | 'discount_percent'
    | 'totalAmount'
    | 'prepaymentAmount'
    | 'debt'
  > | null | undefined,
): OrderAmountsView {
  if (!order) return zero;

  const hasBackendTotals =
    typeof order.totalAmount === 'number' && Number.isFinite(order.totalAmount);

  if (!hasBackendTotals) {
    if (import.meta.env?.DEV) {
      console.warn(
        '[getOrderAmounts] У заказа нет totalAmount с API — проверьте attachAmountsToOrder на бэкенде',
        order,
      );
    }
    return zero;
  }

  return {
    subtotal: Number(order.subtotal) || 0,
    discountPercent: Number(order.discount_percent) || 0,
    discountAmount: Number(order.discountAmount) || 0,
    total: Number(order.totalAmount) || 0,
    prepayment: Number(order.prepaymentAmount) || 0,
    debt: Number(order.debt) || 0,
  };
}

/** @deprecated Используйте order.totalAmount / getOrderAmounts */
export function computeOrderTotalFromItems(
  order: Pick<Order, 'totalAmount' | 'discount_percent'>,
): number {
  return getOrderAmounts(order).total;
}
