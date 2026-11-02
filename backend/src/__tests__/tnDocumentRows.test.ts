import { computeOrderAmounts } from '../utils/orderAmounts'
import { buildTnDocumentRows, isDesignOnlyItem, tnPieceQuantity } from '../services/tnDocumentRows'

describe('товарная накладная', () => {
  const cards = {
    orderId: 1,
    price: 1,
    quantity: 100,
    type: 'Визитки',
    params: {
      productName: 'Визитки',
      sheetsNeeded: 25,
      specifications: { quantity: 100, sheetsNeeded: 25 },
      services: [{ operationName: 'Ламинация', quantity: 100 }],
    },
  }

  it('берёт тираж в штуках, а не листы печати', () => {
    expect(tnPieceQuantity(cards)).toBe(100)
  })

  it('оставляет одну строку изделия и складывает сумму после скидки как в акте', () => {
    const flyers = {
      orderId: 1,
      price: 2,
      quantity: 50,
      params: { productName: 'Листовки', sheetsNeeded: 10 },
    }
    const rows = buildTnDocumentRows([cards, flyers], () => 10)
    const expected = computeOrderAmounts({
      items: [cards, flyers],
      discount_percent: 10,
    }).totalAmount
    expect(rows.orderItems.map((row) => [row.name, row.quantity, row.unit])).toEqual([
      ['Визитки', 100, 'шт.'],
      ['Листовки', 50, 'шт.'],
    ])
    expect(rows.totalAmount).toBe(expected)
    expect(rows.orderItems[0].name).not.toMatch(/Ламинация|лист/)
  })

  it('не включает макет и дизайн без изделия', () => {
    const design = {
      orderId: 2,
      price: 40,
      quantity: 1,
      type: 'design',
      params: { productName: 'Макет' },
    }
    expect(isDesignOnlyItem(design)).toBe(true)
    expect(isDesignOnlyItem(cards)).toBe(false)
    const rows = buildTnDocumentRows([cards, design], () => 0)
    expect(rows.orderItems.map((row) => row.name)).toEqual(['Визитки'])
    expect(rows.totalAmount).toBe(computeOrderAmounts({ items: [cards], discount_percent: 0 }).totalAmount)
  })

  it('скидку считает только по товару, без макета в хвосте округления', () => {
    const goods = { orderId: 5, price: 2.22, quantity: 1, params: { productName: 'Листовки', sheetsNeeded: 1 } }
    const design = {
      orderId: 5,
      price: 2.22,
      quantity: 1,
      type: 'design',
      params: { productName: 'Макет' },
    }
    const rows = buildTnDocumentRows([goods, goods, goods, design], () => 10)
    const expected = computeOrderAmounts({
      items: [goods, goods, goods],
      discount_percent: 10,
    }).totalAmount
    expect(rows.totalAmount).toBe(expected)
    expect(rows.orderItems.every((row) => row.name !== 'Макет')).toBe(true)
  })

  it('режет сумму на срезы, где цена × количество сходится до копейки', () => {
    const pack = {
      orderId: 4,
      price: 3.33,
      quantity: 3,
      params: { productName: 'Набор', sheetsNeeded: 1, storedTotalCost: 10 },
    }
    const rows = buildTnDocumentRows([pack], () => 0)
    expect(rows.totalAmount).toBe(10)
    expect(rows.orderItems.reduce((sum, row) => sum + row.amount, 0)).toBe(10)
    for (const row of rows.orderItems) {
      expect(Math.round(row.price * row.quantity * 100)).toBe(Math.round(row.amount * 100))
    }
    expect(rows.orderItems.map((row) => [row.quantity, row.price, row.amount])).toEqual([
      [2, 3.33, 6.66],
      [1, 3.34, 3.34],
    ])
  })

  it('оставляет изделие, в названии которого есть «дизайн», если есть тираж на листах', () => {
    const designedCards = {
      ...cards,
      params: { ...cards.params, productName: 'Дизайнерские визитки' },
    }
    expect(isDesignOnlyItem(designedCards)).toBe(false)
  })

  it('отказывается собирать накладную только из макета', () => {
    expect(() =>
      buildTnDocumentRows(
        [{ orderId: 3, price: 15, quantity: 1, type: 'design', params: { productName: 'Вёрстка' } }],
        () => 0,
      ),
    ).toThrow(/нет товара/)
  })
})
