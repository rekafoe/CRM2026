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

/** Сегодня YYYY-MM-DD в локальной зоне браузера (не UTC из toISOString). */
export function todayCalendarLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Сдвиг календарной даты YYYY-MM-DD на deltaDays в локальной зоне. */
export function addCalendarDaysLocal(ymd: string, deltaDays: number): string {
  const base = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(base.getTime())) return ymd;
  base.setDate(base.getDate() + deltaDays);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

/** Заказ в пуле «Ожидает» (status=0) — не в выручку счётчиков. status=1 — «Оформлен», учитывается. */
export function isOrderExcludedFromCashCounter(order: { status?: number | string | null }): boolean {
  return Number(order.status) === 0;
}

function countsAsPaidForCashCounter(
  order: {
    prepaymentStatus?: string | null;
    prepaymentAmount?: string | number | null;
    prepayment_amount?: string | number | null;
    paymentMethod?: string | null;
    prepaymentUpdatedAt?: string | null;
  },
  reportDate: string,
): boolean {
  const status = String(order.prepaymentStatus ?? '').toLowerCase();
  if (status === 'paid' || status === 'successful') return true;
  const prepayment = parseNumberFlexible(order.prepaymentAmount ?? order.prepayment_amount ?? 0);
  if (prepayment <= 0) return false;
  const method = String(order.paymentMethod ?? '').toLowerCase();
  if (method === 'offline') return true;
  const rd = reportDate.slice(0, 10);
  const prepayDay = calendarDateLocal(String(order.prepaymentUpdatedAt ?? ''));
  if (prepayDay === rd && method !== 'online' && method !== 'telegram') return true;
  if (!order.prepaymentStatus && method !== 'online' && method !== 'telegram') return true;
  return false;
}

/** Учитывать заказ в выручке кассы (канал + ненулевой приход за день). */
export function shouldIncludeOrderInCashRegister(
  order: {
    payment_channel?: string | null;
    status?: number | string | null;
  },
  reportDate: string,
  cashIncrement: number,
): boolean {
  if (isOrderExcludedFromCashCounter(order)) return false;
  const channel = String(order.payment_channel ?? 'cash').toLowerCase();
  if (channel === 'internal') return false;
  if (cashIncrement > 0) return true;
  return channel === 'cash';
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
    paymentMethod?: string | null;
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

  const rd = reportDate.slice(0, 10);
  const issueRaw = order.cash_from_issue_today;
  const hasIssue = issueRaw !== null && issueRaw !== undefined;
  const issueAmt = hasIssue ? Number(issueRaw) : NaN;

  if (hasIssue && Number.isFinite(issueAmt) && issueAmt > 0) {
    const prepayment = parseNumberFlexible(order.prepaymentAmount ?? order.prepayment_amount ?? 0);
    const created = calendarDateLocal(String(order.created_at ?? order.createdAt ?? ''));
    if (created === rd && prepayment > 0) {
      if (issueAmt < prepayment) return prepayment;
      if (issueAmt === 0) return prepayment;
    }
    return Math.max(0, issueAmt);
  }

  const prepayment = parseNumberFlexible(order.prepaymentAmount ?? order.prepayment_amount ?? 0);
  if (prepayment <= 0 || !countsAsPaidForCashCounter(order, rd)) return 0;
  const prepayDay = calendarDateLocal(String(order.prepaymentUpdatedAt ?? ''));
  return prepayDay === rd ? prepayment : 0;
}

export function normalizeEmptyStringsToNull<T extends Record<string, any>>(obj: T): T {
  const out: any = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(out)) {
    if (out[key] === '') out[key] = null;
  }
  return out;
}


