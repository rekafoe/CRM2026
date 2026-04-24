/**
 * Кому писать order_item_earnings: CRM — цепочка executor → responsible → userId;
 * сайт / MAP / TG (в orders) пока никто не взял заказ (o.userId пуст) — не тянем «зависший» responsible
 * для site (только executor по позиции); для mini_app допускаем responsible, если взяли в CRM без reassign.
 */
export type EarningsOrderItemRow = {
  userId: number | null;
  executorUserId: number | null;
  responsibleUserId: number | null;
  orderSource: string | null;
};

export function effectiveEarningsUserId(row: EarningsOrderItemRow): number | null {
  const orderUser = row.userId;
  const src = String(row.orderSource || '').toLowerCase();
  const isPool = src === 'website' || src === 'mini_app' || src === 'telegram';
  const taken = orderUser != null && Number.isFinite(Number(orderUser));
  if (isPool && !taken) {
    if (row.executorUserId != null && Number.isFinite(Number(row.executorUserId))) {
      return Number(row.executorUserId);
    }
    if (src === 'mini_app' && row.responsibleUserId != null && Number.isFinite(Number(row.responsibleUserId))) {
      return Number(row.responsibleUserId);
    }
    return null;
  }
  if (row.executorUserId != null && Number.isFinite(Number(row.executorUserId))) {
    return Number(row.executorUserId);
  }
  if (row.responsibleUserId != null && Number.isFinite(Number(row.responsibleUserId))) {
    return Number(row.responsibleUserId);
  }
  if (orderUser != null && Number.isFinite(Number(orderUser))) {
    return Number(orderUser);
  }
  return null;
}
