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
