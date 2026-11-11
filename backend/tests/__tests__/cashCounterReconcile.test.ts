import {
  cashExpectedCounter,
  cashFactGap,
  expectedPrinterCounter,
  printerFactGap,
  splitSignedGaps,
  sumExpectedPrinterClicks,
} from '../../../frontend/src/utils/cashCounterReconcile'

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
})
