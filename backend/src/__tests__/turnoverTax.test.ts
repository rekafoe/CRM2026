import { TURNOVER_TAX_RATE, turnoverTaxAmount } from '../utils/turnoverTax'

describe('turnoverTaxAmount', () => {
  it('is 6% of turnover, rounded to kopecks', () => {
    expect(TURNOVER_TAX_RATE).toBe(0.06)
    expect(turnoverTaxAmount(1000)).toBe(60)
    expect(turnoverTaxAmount(10.01)).toBe(0.6)
    expect(turnoverTaxAmount(0)).toBe(0)
    expect(turnoverTaxAmount(-5)).toBe(0)
  })
})