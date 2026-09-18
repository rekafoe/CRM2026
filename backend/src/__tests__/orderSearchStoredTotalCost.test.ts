/**
 * Regression: OrdersManagement uses GET /orders/search with limit/offset.
 * Paginated SQL used price×qty while CRM detail uses storedTotalCost → wrong list totals/debt.
 */
import { computeOrderAmounts, computeItemLineTotal } from '../utils/orderAmounts'
import { SQL_ITEM_LINE_TOTAL_EXPR, SQL_ITEMS_SUBTOTAL_BY_ORDER } from '../utils/orderAmountsSql'

describe('order search / report totals vs storedTotalCost', () => {
  it('SQL helpers prefer storedTotalCost over price×qty', () => {
    expect(SQL_ITEM_LINE_TOTAL_EXPR).toContain("json_extract(i.params, '$.storedTotalCost')")
    expect(SQL_ITEMS_SUBTOTAL_BY_ORDER).toContain("json_extract(params, '$.storedTotalCost')")
    expect(SQL_ITEM_LINE_TOTAL_EXPR).not.toMatch(/^\s*i\.price\s*\*\s*i\.quantity\s*$/m)
  })

  it('list totalAmount must match attachAmounts (stored 92.95 ≠ 1.7×65)', () => {
    const items = [
      {
        price: 1.7,
        quantity: 65,
        params: { storedTotalCost: 92.95 },
      },
    ]
    const priceTimesQty = Math.round(1.7 * 65 * 100) / 100
    expect(priceTimesQty).toBe(110.5)
    expect(computeItemLineTotal(items[0])).toBe(92.95)
    const amounts = computeOrderAmounts({ items, discount_percent: 0 })
    expect(amounts.totalAmount).toBe(92.95)
    expect(amounts.totalAmount).not.toBe(priceTimesQty)
  })

  it('discount is applied on storedTotalCost base (search used to skip attachAmounts)', () => {
    const amounts = computeOrderAmounts({
      items: [{ price: 1.7, quantity: 65, params: { storedTotalCost: 100 } }],
      discount_percent: 10,
    })
    expect(amounts.subtotal).toBe(100)
    expect(amounts.totalAmount).toBe(90)
  })
})
