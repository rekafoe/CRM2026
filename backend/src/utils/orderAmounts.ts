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

/** Число из API/формы: number или строка «92,95». */
export function parseMoneyInput(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return round2(v);
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(',', '.'));
    if (Number.isFinite(n)) return round2(n);
  }
  return null;
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
  return parseMoneyInput(obj.storedTotalCost);
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

/** Уже полученные деньги. Ссылка BePaid в ожидании и провал оплаты сюда не входят. */
export function collectedPrepaymentAmount(order: {
  prepaymentAmount?: number | string | null
  prepaymentStatus?: string | null
  paymentMethod?: string | null
}): number {
  const prepay = round2(parseNum(order.prepaymentAmount))
  if (prepay <= 0) return 0
  const status = String(order.prepaymentStatus ?? '').trim().toLowerCase()
  if (status === 'paid' || status === 'successful') return prepay
  const method = String(order.paymentMethod ?? '').trim().toLowerCase()
  if (method === 'online' || method === 'telegram') return 0
  if (status === 'pending' || status === 'failed' || status === 'cancelled' || status === 'canceled') return 0
  return prepay
}

/** Сколько взять в кассу при выдаче: итог минус уже полученные деньги. */
export function issueCashRemainder(
  totalAmount: number,
  order: {
    prepaymentAmount?: number | string | null
    prepaymentStatus?: string | null
    paymentMethod?: string | null
  },
): number {
  return round2(Math.max(0, round2(totalAmount) - collectedPrepaymentAmount(order)))
}

/** Сумма позиции после скидки заказа. База та же, что в карточке: storedTotalCost, иначе price × quantity. */
export function discountedItemAmount(item: ItemLike, discountPercent: number): number {
  const base = computeItemLineTotal(item);
  const pct = parseNum(discountPercent);
  if (pct <= 0) return base;
  return round2(base * (1 - pct / 100));
}

/**
 * Суммы строк бланка/чека. Сумма строк равна итогу заказа после скидки
 * (как computeOrderAmounts), копейка округления садится на последнюю строку.
 */
export function discountedItemAmounts(items: ItemLike[], discountPercent: number): number[] {
  if (items.length === 0) return [];
  const total = computeOrderAmounts({ items, discount_percent: discountPercent }).totalAmount;
  const lines = items.map((item) => discountedItemAmount(item, discountPercent));
  const diff = round2(total - round2(lines.reduce((sum, line) => sum + line, 0)));
  if (Math.abs(diff) >= 0.01) {
    lines[lines.length - 1] = round2(lines[lines.length - 1] + diff);
  }
  return lines;
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
