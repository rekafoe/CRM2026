import type { Item, Order } from '../types';

/** Итог позиции из params.storedTotalCost (как на бэкенде). */
export function readItemStoredTotalCost(
  params: Item['params'] | string | null | undefined,
): number | null {
  if (params == null) return null;
  let obj: { storedTotalCost?: unknown } | null = null;
  if (typeof params === 'string') {
    try {
      obj = JSON.parse(params) as { storedTotalCost?: unknown };
    } catch {
      return null;
    }
  } else if (typeof params === 'object') {
    obj = params as { storedTotalCost?: unknown };
  }
  if (!obj) return null;
  const stored = obj.storedTotalCost;
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
  if (typeof stored === 'string' && stored.trim() !== '') {
    const n = Number(stored.replace(',', '.'));
    if (Number.isFinite(n)) return Math.round(n * 100) / 100;
  }
  return null;
}

export function getItemLineTotal(item: Pick<Item, 'price' | 'quantity' | 'params' | 'lineTotal' | 'serviceCost'>): number {
  if (typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal)) {
    return Math.round(item.lineTotal * 100) / 100;
  }
  const stored = readItemStoredTotalCost(item.params);
  if (stored != null) return stored;
  const qty = Math.max(1, Number(item.quantity) || 1);
  const price = Number(item.price) || 0;
  const service = Number(item.serviceCost) || 0;
  return Math.round((price * qty + service) * 100) / 100;
}

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
