/**
 * Сверка счётчиков касс с CRM.
 * Формулы те же, что на экране оператора (`CountersPage`):
 * - клики принтера — `expected_clicks` из GET /printers/counters
 *   (`loadPrinterExpectedClicksForDay`);
 * - расчётный счётчик принтера — факт вчера (или 0, если не снят) + эти клики;
 * - отклонение принтера — факт сегодня минус расчётный счётчик;
 * - ожидаемое по кассе — факт терминала за вчера (или 0) + `cash_in_today`;
 * - разница кассы — факт терминала сегодня минус это ожидаемое.
 */

export type PrinterReading = {
  value?: number | null;
  prev_value?: number | null;
  expected_clicks?: number | null;
};

export type GapDirection = 'more' | 'less' | 'even';

export type GapSplit = {
  /** Сумма известных отклонений. Нет ни одного факта — null, не ноль. */
  net: number | null;
  /** Сумма отклонений в большую сторону (факт выше ожидаемого). */
  more: number;
  /** Сумма модулей отклонений в меньшую сторону. */
  less: number;
  known: number;
  missing: number;
};

function finiteOr(value: number | null | undefined, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseCashActual(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Клики заказов CRM за день по одному принтеру. */
export function expectedPrinterClicks(printer: PrinterReading): number {
  return finiteOr(printer.expected_clicks, 0);
}

/** Расчётный счётчик: вчерашний факт + клики CRM. Нет вчера — база 0. */
export function expectedPrinterCounter(printer: PrinterReading): number {
  return finiteOr(printer.prev_value, 0) + expectedPrinterClicks(printer);
}

/** Факт сегодня минус расчётный счётчик. Нет сегодняшнего факта — null. */
export function printerFactGap(printer: PrinterReading): number | null {
  if (printer.value == null) return null;
  const current = Number(printer.value);
  if (!Number.isFinite(current)) return null;
  return current - expectedPrinterCounter(printer);
}

export function sumExpectedPrinterClicks(printers: PrinterReading[]): number {
  return printers.reduce((sum, printer) => sum + expectedPrinterClicks(printer), 0);
}

/** Расчётный счётчик кассы: факт вчера + в кассу за день из CRM. */
export function cashExpectedCounter(
  previousActual: number | null | undefined,
  cashInToday: number | null | undefined,
): number {
  return finiteOr(previousActual, 0) + finiteOr(cashInToday, 0);
}

/** Факт терминала минус ожидаемое. Нет факта — null, не ноль. */
export function cashFactGap(
  actual: number | null | undefined,
  expected: number,
): number | null {
  if (actual == null) return null;
  const fact = Number(actual);
  if (!Number.isFinite(fact)) return null;
  return fact - expected;
}

export function gapDirection(delta: number, epsilon = 0): GapDirection {
  if (!Number.isFinite(delta) || Math.abs(delta) <= epsilon) return 'even';
  return delta > 0 ? 'more' : 'less';
}

export const GAP_DIRECTION_LABEL: Record<GapDirection, string> = {
  more: 'больше',
  less: 'меньше',
  even: 'совпадает',
};

/** Раскладывает отклонения на «в большую» и «в меньшую», не подменяя пустой факт нулём. */
export function splitSignedGaps(deltas: Array<number | null>, epsilon = 0): GapSplit {
  let net = 0;
  let more = 0;
  let less = 0;
  let known = 0;
  let missing = 0;
  for (const delta of deltas) {
    if (delta == null || !Number.isFinite(delta)) {
      missing += 1;
      continue;
    }
    known += 1;
    net += delta;
    if (delta > epsilon) more += delta;
    else if (delta < -epsilon) less += -delta;
  }
  return {
    net: known > 0 ? net : null,
    more,
    less,
    known,
    missing,
  };
}
