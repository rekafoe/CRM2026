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

/** Календарная дата YYYY-MM-DD в локальной зоне браузера (для сопоставления с датой отчёта). */
export function calendarDateLocal(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Касса за выбранный календарный день по заказу.
 * Предпочитает cash_for_report_date с API (GET /reports/daily/:date/orders).
 */
export function cashIncrementForRegisterDay(
  order: {
    cash_for_report_date?: number | null;
    cash_from_issue_today?: number | null;
    prepaymentAmount?: string | number | null;
    prepayment_amount?: string | number | null;
    prepaymentStatus?: string | null;
    prepaymentUpdatedAt?: string | null;
    created_at?: string | null;
    createdAt?: string | null;
  },
  reportDate: string
): number {
  const fromApi = order.cash_for_report_date;
  if (fromApi !== null && fromApi !== undefined && Number.isFinite(Number(fromApi))) {
    return Math.max(0, Number(fromApi));
  }

  const prepayment = parseNumberFlexible(order.prepaymentAmount ?? order.prepayment_amount ?? 0);
  const rd = reportDate.slice(0, 10);
  const status = String(order.prepaymentStatus ?? '').toLowerCase();
  const isPaid = status === 'paid' || status === 'successful';
  if (!isPaid || prepayment <= 0) return 0;

  const prepayDay = calendarDateLocal(String(order.prepaymentUpdatedAt ?? ''));
  const created = calendarDateLocal(String(order.created_at ?? order.createdAt ?? ''));

  const v = order.cash_from_issue_today;
  if (v === null || v === undefined) {
    return prepayDay === rd ? prepayment : 0;
  }
  const debt = Number(v);
  if (!Number.isFinite(debt)) {
    return prepayDay === rd ? prepayment : 0;
  }

  if (created === rd) {
    if (debt < prepayment) return prepayment;
    if (debt === 0 && prepayment > 0) return prepayment;
  }
  return Math.max(0, debt);
}

export function normalizeEmptyStringsToNull<T extends Record<string, any>>(obj: T): T {
  const out: any = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(out)) {
    if (out[key] === '') out[key] = null;
  }
  return out;
}


