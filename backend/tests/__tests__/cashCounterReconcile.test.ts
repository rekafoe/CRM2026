import {
  cashActualMove,
  cashExpectedCounter,
  cashFactGap,
  expectedPrinterCounter,
  printerActualClicks,
  printerFactGap,
  reconcileMonthDay,
  splitSignedGaps,
  sumExpectedPrinterClicks,
  sumMonthReconcile,
} from '../../../frontend/src/utils/cashCounterReconcile'
import { datesInMonth, previousCalendarDate } from '../../src/utils/calendarMonth'

describe('cashCounterReconcile', () => {
  it('считает клики CRM и отклонение принтера как на экране оператора', () => {
    const printer = { value: 1100, prev_value: 1000, expected_clicks: 80 }
    expect(sumExpectedPrinterClicks([printer, { value: null, prev_value: 10, expected_clicks: 5 }])).toBe(85)
    expect(expectedPrinterCounter(printer)).toBe(1080)
    expect(printerFactGap(printer)).toBe(20)
    expect(printerFactGap({ value: null, prev_value: 1000, expected_clicks: 80 })).toBeNull()
    expect(expectedPrinterCounter({ value: 50, prev_value: null, expected_clicks: 10 })).toBe(10)
    expect(printerFactGap({ value: 50, prev_value: null, expected_clicks: 10 })).toBe(40)
  })

  it('считает ожидаемую кассу как факт вчера плюс в кассу за день', () => {
    expect(cashExpectedCounter(1000, 25)).toBe(1025)
    expect(cashExpectedCounter(null, 25)).toBe(25)
    expect(cashFactGap(1030, 1025)).toBe(5)
    expect(cashFactGap(1020, 1025)).toBe(-5)
    expect(cashFactGap(null, 1025)).toBeNull()
  })

  it('раскладывает разницу в большую и меньшую сторону и не подменяет пустой факт нулём', () => {
    const split = splitSignedGaps([20, -8, null])
    expect(split).toMatchObject({ net: 12, more: 20, less: 8, known: 2, missing: 1 })
    expect(splitSignedGaps([null, null]).net).toBeNull()
    expect(splitSignedGaps([0.004, -0.002], 0.009)).toMatchObject({
      net: 0.002,
      more: 0,
      less: 0,
      known: 2,
    })
  })

  it('фактические отпечатки — это прирост счётчика, а не его остаток', () => {
    expect(printerActualClicks({ value: 1100, prev_value: 1000, expected_clicks: 80 })).toBe(100)
    expect(printerActualClicks({ value: 50, prev_value: null, expected_clicks: 10 })).toBeNull()
    expect(printerActualClicks({ value: null, prev_value: 10, expected_clicks: 5 })).toBeNull()
    expect(cashActualMove(1030, 1000)).toBe(30)
    expect(cashActualMove(5000, null)).toBeNull()
    expect(cashActualMove(null, 1000)).toBeNull()
  })

  it('месяц показывает ожидаемое и фактическое и не складывает уровни счётчиков', () => {
    const withFact = reconcileMonthDay({
      printers: [
        { value: 1100, prev_value: 1000, expected_clicks: 80 },
        { value: 90, prev_value: 100, expected_clicks: 5 },
      ],
      cashInToday: 25,
      cashActual: 1030,
      previousCashActual: 1000,
      departmentSelected: true,
    })
    const withoutFact = reconcileMonthDay({
      printers: [{ value: 50000, prev_value: null, expected_clicks: 10 }],
      cashInToday: 40,
      cashActual: 5000,
      previousCashActual: null,
      departmentSelected: true,
    })

    expect(withFact.expectedClicks).toBe(85)
    expect(withFact.actualClicks).toBe(90)
    expect(withFact.printerComparedExpected).toBe(85)
    expect(withFact.printerGap).toMatchObject({ net: 5, more: 20, less: 15, known: 2, missing: 0 })
    expect(withFact.actualClicks! - withFact.printerComparedExpected).toBe(withFact.printerGap.net)
    expect(withFact.cashInToday).toBe(25)
    expect(withFact.cashActualMove).toBe(30)
    expect(withFact.cashGap.net).toBe(5)
    expect(withFact.cashActualMove! - withFact.cashComparedExpected).toBe(withFact.cashGap.net)
    expect(withFact.expectedCashLevel).toBe(1025)
    expect(withFact.cashActualLevel).toBe(1030)

    expect(withoutFact.expectedClicks).toBe(10)
    expect(withoutFact.actualClicks).toBeNull()
    expect(withoutFact.printerGap.net).toBeNull()
    expect(withoutFact.cashActualMove).toBeNull()
    expect(withoutFact.cashGap.net).toBeNull()
    expect(withoutFact.cashActualLevel).toBe(5000)
    expect(withoutFact.expectedCashLevel).toBe(40)
    expect(withoutFact.cashLevelWithoutMove).toBe(true)

    const sum = sumMonthReconcile([withFact, withoutFact])
    expect(sum.expectedClicks).toBe(95)
    expect(sum.actualClicks).toBe(90)
    expect(sum.printerGap).toMatchObject({ net: 5, more: 20, less: 15, known: 2, missing: 1 })
    expect(sum.cashInToday).toBe(65)
    expect(sum.cashActualMove).toBe(30)
    expect(sum.cashInToday).not.toBe(1025 + 40)
    expect(sum.cashActualMove).not.toBe(1030 + 5000)
    expect(sum.cashGap).toMatchObject({ net: 5, more: 5, less: 0, known: 1, missing: 1 })
    expect(sum.cashLevelWithoutMove).toBe(1)
    expect(sum.cashActualMove! - sum.cashComparedExpected).toBe(sum.cashGap.net)
  })

  it('без точки не подставляет факт терминала нулём', () => {
    const day = reconcileMonthDay({
      printers: [{ value: 10, prev_value: 4, expected_clicks: 3 }],
      cashInToday: 15,
      cashActual: 999,
      previousCashActual: 1,
      departmentSelected: false,
    })
    expect(day.expectedClicks).toBe(3)
    expect(day.actualClicks).toBe(6)
    expect(day.printerGap.net).toBe(3)
    expect(day.cashInToday).toBe(15)
    expect(day.cashActualMove).toBeNull()
    expect(day.cashActualLevel).toBeNull()
    expect(day.cashGap.net).toBeNull()
  })

  it('календарь месяца и вчера для 1-го числа', () => {
    expect(datesInMonth('2026-02')).toHaveLength(28)
    expect(datesInMonth('2024-02')).toHaveLength(29)
    expect(previousCalendarDate('2026-03-01')).toBe('2026-02-28')
    expect(previousCalendarDate('2024-03-01')).toBe('2024-02-29')
    expect(datesInMonth('bad')).toEqual([])
  })
})
