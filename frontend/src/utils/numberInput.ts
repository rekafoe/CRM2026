export type NumberInputValue = number | '';

export function numberInputFromString(raw: string): NumberInputValue {
  if (raw === '') return '';
  const n = Number(raw);
  return Number.isFinite(n) ? n : '';
}

export function numberInputToNumber(value: NumberInputValue, fallback = 0): number {
  return value === '' ? fallback : value;
}

export function numberInputToNullable(value: NumberInputValue): number | null {
  return value === '' ? null : value;
}

export function parseNumberFlexible(value: number | string | null | undefined, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const normalized = value.replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Касса за выбранный день по заказу: при выдаче бэкенд отдаёт cash_from_issue_today (остаток из debt_closed_events), иначе — предоплата. */
export function cashIncrementForRegisterDay(order: {
  cash_from_issue_today?: number | null;
  prepaymentAmount?: string | number | null;
  prepayment_amount?: string | number | null;
}): number {
  const v = order.cash_from_issue_today;
  if (v !== null && v !== undefined) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return parseNumberFlexible(order.prepaymentAmount ?? order.prepayment_amount ?? 0);
}

export function normalizeEmptyStringsToNull<T extends Record<string, any>>(obj: T): T {
  const out: any = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(out)) {
    if (out[key] === '') out[key] = null;
  }
  return out;
}


