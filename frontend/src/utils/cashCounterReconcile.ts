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

/** Меньше копейки считаем совпадением, как на экране оператора. */
export const CASH_GAP_EPSILON = 0.009;

export type MonthDayInput = {
  printers: PrinterReading[];
  cashInToday?: number | null;
  cashActual?: number | null;
  previousCashActual?: number | null;
  departmentSelected: boolean;
};

export type MonthDayReconcile = {
  expectedClicks: number;
  /** Деньги в кассу из CRM за этот день (`cash_in_today`). */
  cashInToday: number;
  /** Расчётный счётчик: факт вчера (или 0) + cashInToday. По точке. Без точки равен cashInToday. */
  expectedCash: number;
  printerGap: GapSplit;
  cashGap: GapSplit;
};

/** Один день месяца теми же формулами, что дневной экран. */
export function reconcileMonthDay(input: MonthDayInput): MonthDayReconcile {
  const cashInToday = finiteOr(input.cashInToday, 0);
  const expectedClicks = sumExpectedPrinterClicks(input.printers);
  const printerGap = splitSignedGaps(input.printers.map((printer) => printerFactGap(printer)));
  const expectedCash = input.departmentSelected
    ? cashExpectedCounter(input.previousCashActual, cashInToday)
    : cashInToday;
  const cashGap = input.departmentSelected
    ? splitSignedGaps([cashFactGap(input.cashActual, expectedCash)], CASH_GAP_EPSILON)
    : splitSignedGaps([null], CASH_GAP_EPSILON);
  return { expectedClicks, cashInToday, expectedCash, printerGap, cashGap };
}

/** Складывает дневные клики, в кассу из CRM и отклонения. Расчётные счётчики кассы не суммирует. */
export function sumMonthReconcile(days: MonthDayReconcile[]): {
  expectedClicks: number;
  cashInToday: number;
  printerGap: GapSplit;
  cashGap: GapSplit;
} {
  let expectedClicks = 0;
  let cashInToday = 0;
  let printerNet = 0;
  let printerMore = 0;
  let printerLess = 0;
  let printerKnown = 0;
  let printerMissing = 0;
  let printerAny = false;
  let cashNet = 0;
  let cashMore = 0;
  let cashLess = 0;
  let cashKnown = 0;
  let cashMissing = 0;
  let cashAny = false;

  for (const day of days) {
    expectedClicks += day.expectedClicks;
    cashInToday += day.cashInToday;
    printerMissing += day.printerGap.missing;
    printerKnown += day.printerGap.known;
    printerMore += day.printerGap.more;
    printerLess += day.printerGap.less;
    if (day.printerGap.net != null) {
      printerNet += day.printerGap.net;
      printerAny = true;
    }
    cashMissing += day.cashGap.missing;
    cashKnown += day.cashGap.known;
    cashMore += day.cashGap.more;
    cashLess += day.cashGap.less;
    if (day.cashGap.net != null) {
      cashNet += day.cashGap.net;
      cashAny = true;
    }
  }

  return {
    expectedClicks,
    cashInToday,
    printerGap: {
      net: printerAny ? printerNet : null,
      more: printerMore,
      less: printerLess,
      known: printerKnown,
      missing: printerMissing,
    },
    cashGap: {
      net: cashAny ? cashNet : null,
      more: cashMore,
      less: cashLess,
      known: cashKnown,
      missing: cashMissing,
    },
  };
}

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
