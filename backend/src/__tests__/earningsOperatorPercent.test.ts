import {
  CUSTOM_CALCULATOR_OPERATOR_PERCENT,
  resolveEarningsOperatorPercent,
} from '../services/earningsOperatorPercent'

describe('resolveEarningsOperatorPercent', () => {
  const productPercentMap = new Map<number, number>([[12, 7]])
  const operationPercentMap = new Map<number, number>([[5, 15]])

  it('произвольный калькулятор берёт живые 20, а не снимок 10 и не процент чужого продукта', () => {
    expect(
      resolveEarningsOperatorPercent({
        params: {
          customProduct: true,
          productType: 'custom',
          productId: 12,
          operator_percent: 10,
          services: [{ operationId: 5 }],
        },
        itemType: 'custom',
        productPercentMap,
        operationPercentMap,
      }),
    ).toBe(CUSTOM_CALCULATOR_OPERATOR_PERCENT)
  })

  it('старая позиция с type=custom и снимком 10 тоже получает 20', () => {
    expect(
      resolveEarningsOperatorPercent({
        params: { operator_percent: 10 },
        itemType: 'custom',
        productPercentMap,
        operationPercentMap,
      }),
    ).toBe(20)
  })

  it('productId витрины -1000 считается произвольным калькулятором', () => {
    expect(
      resolveEarningsOperatorPercent({
        params: { productId: -1000, operator_percent: 10 },
        itemType: 'print',
        productPercentMap,
        operationPercentMap,
      }),
    ).toBe(20)
  })

  it('обычный продукт берёт процент из справочника, не 20', () => {
    expect(
      resolveEarningsOperatorPercent({
        params: { productId: 12, operator_percent: 10 },
        itemType: '12',
        productPercentMap,
        operationPercentMap,
      }),
    ).toBe(7)
  })

  it('послепечать берёт процент операции, не процент произвольного калькулятора', () => {
    expect(
      resolveEarningsOperatorPercent({
        params: { postprintProduct: true, postprintOperations: [{ serviceId: 5 }] },
        itemType: 'postprint',
        productPercentMap,
        operationPercentMap,
      }),
    ).toBe(15)
  })

  it('если процента в справочнике нет, остаётся снимок из params', () => {
    expect(
      resolveEarningsOperatorPercent({
        params: { operator_percent: 8 },
        itemType: 'print',
        productPercentMap,
        operationPercentMap,
      }),
    ).toBe(8)
  })
})