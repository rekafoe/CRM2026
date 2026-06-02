import {
  attachAmountsToOrder,
  computeItemLineTotal,
  computeOrderAmounts,
} from '../utils/orderAmounts';

describe('orderAmounts', () => {
  it('computeItemLineTotal prefers storedTotalCost', () => {
    expect(
      computeItemLineTotal({
        price: 86,
        quantity: 10,
        params: { storedTotalCost: 328 },
      })
    ).toBe(328);
  });

  it('computeItemLineTotal falls back to price × quantity', () => {
    expect(
      computeItemLineTotal({ price: 32.8, quantity: 10, params: {} })
    ).toBe(328);
  });

  it('computeItemLineTotal accepts storedTotalCost as numeric string', () => {
    expect(
      computeItemLineTotal({
        price: 1.7,
        quantity: 65,
        params: { storedTotalCost: '92.95' as unknown as number },
      })
    ).toBe(92.95);
  });

  it('computeItemLineTotal adds serviceCost', () => {
    expect(
      computeItemLineTotal({
        price: 100,
        quantity: 1,
        serviceCost: 15,
        params: { storedTotalCost: 100 },
      })
    ).toBe(115);
  });

  it('computeOrderAmounts applies discount and debt', () => {
    const amounts = computeOrderAmounts({
      items: [{ price: 100, quantity: 2, params: { storedTotalCost: 200 } }],
      discount_percent: 10,
      prepaymentAmount: 50,
    });
    expect(amounts.subtotal).toBe(200);
    expect(amounts.discountAmount).toBe(20);
    expect(amounts.totalAmount).toBe(180);
    expect(amounts.debt).toBe(130);
  });

  it('attachAmountsToOrder sets lineTotal on items', () => {
    const order = attachAmountsToOrder({
      id: 1,
      items: [{ price: 10, quantity: 3, params: { storedTotalCost: 30 } }],
      discount_percent: 0,
      prepaymentAmount: 0,
    } as any);
    expect(order.items[0].lineTotal).toBe(30);
    expect(order.subtotal).toBe(30);
    expect(order.totalAmount).toBe(30);
  });
});
