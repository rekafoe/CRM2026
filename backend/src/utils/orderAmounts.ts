/**
 * Единый расчёт сумм заказа для API и внутренней логики CRM.
 * Источник по позиции: params.storedTotalCost (калькулятор / пересчёт), иначе price × quantity.
 */

export type ItemLike = {
  price?: number | string | null;
  quantity?: number | string | null;
  serviceCost?: number | string | null;
  params?: { storedTotalCost?: number | null; [key: string]: unknown } | string | null;
  lineTotal?: number;
};

export type OrderLike = {
  items?: ItemLike[];
  discount_percent?: number | string | null;
  prepaymentAmount?: number | string | null;
  subtotal?: number;
  discountAmount?: number;
  totalAmount?: number;
  debt?: number;
};

export type OrderAmounts = {
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  totalAmount: number;
  prepayment: number;
  debt: number;
};

function parseNum(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function readStoredTotalCost(params: ItemLike['params']): number | null {
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
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Сумма одной позиции (без скидки на заказ). */
export function computeItemLineTotal(item: ItemLike): number {
  const stored = readStoredTotalCost(item.params);
  const qty = Math.max(1, parseNum(item.quantity) || 1);
  const base =
    stored != null
      ? stored
      : round2(parseNum(item.price) * qty);
  const service = parseNum(item.serviceCost);
  return round2(base + service);
}

export function attachAmountsToItems<T extends ItemLike>(items: T[]): Array<T & { lineTotal: number }> {
  return items.map((item) => ({
    ...item,
    lineTotal: computeItemLineTotal(item),
  }));
}

export function computeOrderAmounts(order: OrderLike): OrderAmounts {
  const items = order.items ?? [];
  const subtotal = round2(
    items.reduce((sum, it) => sum + computeItemLineTotal(it), 0)
  );
  const discountPercent = parseNum(order.discount_percent);
  const discountAmount = round2(subtotal * (discountPercent / 100));
  const totalAmount = round2(subtotal - discountAmount);
  const prepayment = round2(parseNum(order.prepaymentAmount));
  const debt = round2(Math.max(0, totalAmount - prepayment));

  return {
    subtotal,
    discountPercent,
    discountAmount,
    totalAmount,
    prepayment,
    debt,
  };
}

/** Обогащает заказ: lineTotal на позициях + subtotal, discountAmount, totalAmount, debt. */
export function attachAmountsToOrder<T extends OrderLike>(order: T): T & OrderAmounts & { items: Array<ItemLike & { lineTotal: number }> } {
  const items = attachAmountsToItems(order.items ?? []);
  const amounts = computeOrderAmounts({ ...order, items });
  return {
    ...order,
    items,
    subtotal: amounts.subtotal,
    discountAmount: amounts.discountAmount,
    totalAmount: amounts.totalAmount,
    debt: amounts.debt,
    discount_percent: amounts.discountPercent,
    prepaymentAmount: amounts.prepayment,
  } as T & OrderAmounts & { items: Array<ItemLike & { lineTotal: number }> };
}
