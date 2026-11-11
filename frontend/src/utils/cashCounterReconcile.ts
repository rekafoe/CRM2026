/**
 * Сверка счётчиков касс с CRM.
 * Формулы те же, что на экране оператора (`CountersPage`):
 * - клики принтера — `expected_clicks` из GET /printers/counters
 *   (`loadPrinterExpectedClicksForDay`);
 * - расчётный счётчик принтера — факт вчера (или 0, если не снят) + эти клики;
 * - отклонение принтера — факт сегодня минус расчётный счётчик;
 * - ожидаемое по кассе — факт терминала за вчера (или 0) + `cash_in_today`;
 * - разница кассы — факт терминала сегодня минус это ожидаемое.
 *
 * Итог месяца на /adminpanel/counters не складывает уровни счётчиков:
 * - ожидаемое по принтерам — сумма `expected_clicks`;
 * - фактическое по принтерам — сумма (сегодня − предыдущий), если сняты оба;
 * - ожидаемое по кассе — сумма `cash_in_today`;
 * - фактическое по кассе — сумма (факт терминала сегодня − вчера), если введены оба;
 * - разница — фактическое минус ожидаемое там, где факт известен.
 * Расчётный уровень кассы и сам остаток терминала остаются на карточке дня.
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

/** Меньше копейки считаем совпадением, как на экране оператора. */
export const CASH_GAP_EPSILON = 0.009;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Фактические отпечатки: сегодняшний счётчик минус предыдущий.
 * Нет одного из показаний — null, не ноль и не сам остаток счётчика.
 */
export function printerActualClicks(printer: PrinterReading): number | null {
  if (printer.value == null || printer.prev_value == null) return null;
  const current = Number(printer.value);
  const previous = Number(printer.prev_value);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return current - previous;
}

/**
 * Фактический прирост терминала. Нет факта сегодня или вчера — null:
 * остаток терминала не подменяет выручку дня.
 */
export function cashActualMove(
  actual: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (actual == null || previous == null) return null;
  const fact = Number(actual);
  const prev = Number(previous);
  if (!Number.isFinite(fact) || !Number.isFinite(prev)) return null;
  return roundMoney(fact - prev);
}

export type MonthDayInput = {
  printers: PrinterReading[];
  /** `cash_in_today`. null — источник месяца его не отдал. */
  cashInToday?: number | null;
  cashActual?: number | null;
  previousCashActual?: number | null;
  departmentSelected: boolean;
};

export type MonthDayReconcile = {
  expectedClicks: number;
  /** Сумма (сегодня − предыдущий) по принтерам с парой показаний. Нет ни одной пары — null. */
  actualClicks: number | null;
  /** Клики CRM только у принтеров, которые вошли в actualClicks. */
  printerComparedExpected: number;
  printerGap: GapSplit;
  cashInToday: number | null;
  /** Прирост терминала. Нет пары фактов — null. */
  cashActualMove: number | null;
  /** «В кассу» только за дни, где прирост известен. */
  cashComparedExpected: number;
  cashGap: GapSplit;
  /** Остаток терминала за день. В итог месяца не входит. */
  cashActualLevel: number | null;
  /** Вчерашний факт (или 0) + в кассу. В итог месяца не входит. */
  expectedCashLevel: number | null;
  /** Факт за день есть, вчерашнего нет: прирост не считаем. */
  cashLevelWithoutMove: boolean;
};

const ZERO_GAP: GapSplit = { net: null, more: 0, less: 0, known: 0, missing: 0 };

function emptyGap(epsilon = 0): GapSplit {
  return splitSignedGaps([null], epsilon);
}

/** Один день месяца: те же клики и та же касса, что дневной экран, плюс сопоставимый факт. */
export function reconcileMonthDay(input: MonthDayInput): MonthDayReconcile {
  let actualClicks = 0;
  let actualKnown = 0;
  let printerComparedExpected = 0;
  const printerDeltas: Array<number | null> = [];
  for (const printer of input.printers) {
    const clicks = expectedPrinterClicks(printer);
    const fact = printerActualClicks(printer);
    if (fact == null) {
      printerDeltas.push(null);
      continue;
    }
    actualKnown += 1;
    actualClicks += fact;
    printerComparedExpected += clicks;
    printerDeltas.push(fact - clicks);
  }

  const cashInToday = input.cashInToday == null || !Number.isFinite(Number(input.cashInToday))
    ? null
    : roundMoney(Number(input.cashInToday));
  const cashActualLevel = input.departmentSelected && input.cashActual != null
    && Number.isFinite(Number(input.cashActual))
    ? roundMoney(Number(input.cashActual))
    : null;
  const previousLevel = input.departmentSelected && input.previousCashActual != null
    && Number.isFinite(Number(input.previousCashActual))
    ? roundMoney(Number(input.previousCashActual))
    : null;
  const actualMove = input.departmentSelected
    ? cashActualMove(cashActualLevel, previousLevel)
    : null;
  const cashComparedExpected = actualMove != null && cashInToday != null ? cashInToday : 0;
  const cashGap = actualMove == null || cashInToday == null
    ? emptyGap(CASH_GAP_EPSILON)
    : splitSignedGaps([roundMoney(actualMove - cashInToday)], CASH_GAP_EPSILON);

  return {
    expectedClicks: sumExpectedPrinterClicks(input.printers),
    actualClicks: actualKnown > 0 ? actualClicks : null,
    printerComparedExpected,
    printerGap: splitSignedGaps(printerDeltas),
    cashInToday,
    cashActualMove: actualMove,
    cashComparedExpected,
    cashGap,
    cashActualLevel,
    expectedCashLevel: input.departmentSelected && cashInToday != null
      ? cashExpectedCounter(previousLevel, cashInToday)
      : null,
    cashLevelWithoutMove: input.departmentSelected && cashActualLevel != null && previousLevel == null,
  };
}

export type MonthReconcileSum = {
  expectedClicks: number;
  actualClicks: number | null;
  printerComparedExpected: number;
  printerGap: GapSplit;
  cashInToday: number | null;
  cashActualMove: number | null;
  cashComparedExpected: number;
  cashGap: GapSplit;
  cashLevelWithoutMove: number;
};

function addGap(base: GapSplit, extra: GapSplit): GapSplit {
  const netKnown = base.net != null || extra.net != null;
  return {
    net: netKnown ? (base.net ?? 0) + (extra.net ?? 0) : null,
    more: base.more + extra.more,
    less: base.less + extra.less,
    known: base.known + extra.known,
    missing: base.missing + extra.missing,
  };
}

/** Складывает клики, отпечатки, «в кассу» и прирост терминала. Уровни счётчиков не суммирует. */
export function sumMonthReconcile(days: MonthDayReconcile[]): MonthReconcileSum {
  let expectedClicks = 0;
  let actualClicks = 0;
  let sawActualClicks = false;
  let printerComparedExpected = 0;
  let printerGap = ZERO_GAP;
  let cashInToday = 0;
  let sawCashIn = false;
  let cashActualMove = 0;
  let sawCashMove = false;
  let cashComparedExpected = 0;
  let cashGap = ZERO_GAP;
  let cashLevelWithoutMove = 0;

  for (const day of days) {
    expectedClicks += day.expectedClicks;
    printerComparedExpected += day.printerComparedExpected;
    if (day.actualClicks != null) {
      actualClicks += day.actualClicks;
      sawActualClicks = true;
    }
    printerGap = addGap(printerGap, day.printerGap);
    if (day.cashInToday != null) {
      cashInToday += day.cashInToday;
      sawCashIn = true;
    }
    if (day.cashActualMove != null) {
      cashActualMove += day.cashActualMove;
      sawCashMove = true;
    }
    cashComparedExpected += day.cashComparedExpected;
    cashGap = addGap(cashGap, day.cashGap);
    if (day.cashLevelWithoutMove) cashLevelWithoutMove += 1;
  }

  return {
    expectedClicks,
    actualClicks: sawActualClicks ? actualClicks : null,
    printerComparedExpected,
    printerGap,
    cashInToday: sawCashIn ? roundMoney(cashInToday) : null,
    cashActualMove: sawCashMove ? roundMoney(cashActualMove) : null,
    cashComparedExpected: roundMoney(cashComparedExpected),
    cashGap,
    cashLevelWithoutMove,
  };
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
