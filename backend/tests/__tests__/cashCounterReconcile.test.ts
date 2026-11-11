import {
  cashExpectedCounter,
  cashFactGap,
  expectedPrinterCounter,
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

  it('месяц складывает дневные клики и в кассу из CRM, не расчётные счётчики', () => {
    const days = [
      reconcileMonthDay({
        printers: [{ value: 1100, prev_value: 1000, expected_clicks: 80 }],
        cashInToday: 25,
        cashActual: 1030,
        previousCashActual: 1000,
        departmentSelected: true,
      }),
      reconcileMonthDay({
        printers: [{ value: null, prev_value: 1100, expected_clicks: 10 }],
        cashInToday: 40,
        cashActual: null,
        previousCashActual: 1030,
        departmentSelected: true,
      }),
    ]
    expect(days[0].expectedCash).toBe(1025)
    expect(days[0].cashGap.net).toBe(5)
    expect(days[0].printerGap.net).toBe(20)
    expect(days[1].expectedCash).toBe(1070)
    expect(days[1].cashGap.net).toBeNull()
    expect(days[1].printerGap.net).toBeNull()

    const sum = sumMonthReconcile(days)
    expect(sum.expectedClicks).toBe(90)
    expect(sum.cashInToday).toBe(65)
    expect(sum.cashInToday).not.toBe(1025 + 1070)
    expect(sum.printerGap).toMatchObject({ net: 20, more: 20, less: 0, known: 1, missing: 1 })
    expect(sum.cashGap).toMatchObject({ net: 5, more: 5, less: 0, known: 1, missing: 1 })
  })

  it('без точки не подставляет факт терминала нулём', () => {
    const day = reconcileMonthDay({
      printers: [{ value: 10, prev_value: 4, expected_clicks: 3 }],
      cashInToday: 15,
      cashActual: 999,
      previousCashActual: 1,
      departmentSelected: false,
    })
    expect(day.expectedCash).toBe(15)
    expect(day.cashGap.net).toBeNull()
    expect(day.printerGap.net).toBe(3)
  })

  it('календарь месяца и вчера для 1-го числа', () => {
    expect(datesInMonth('2026-02')).toHaveLength(28)
    expect(datesInMonth('2024-02')).toHaveLength(29)
    expect(previousCalendarDate('2026-03-01')).toBe('2026-02-28')
    expect(previousCalendarDate('2024-03-01')).toBe('2024-02-29')
    expect(datesInMonth('bad')).toEqual([])
  })
})
