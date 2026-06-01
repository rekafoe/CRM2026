import type { Order } from '../types';

/** Итог заказа по позициям с учётом discount_percent (как в пуле и OptimizedApp). */
export function computeOrderTotalFromItems(
  order: Pick<Order, 'items'> & { discount_percent?: number },
): number {
  const items = order.items ?? [];
  const subtotal = items.reduce(
    (s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1),
    0,
  );
  const pct = Number(order.discount_percent) || 0;
  return Math.round((1 - pct / 100) * subtotal * 100) / 100;
}
