import {
  attachAmountsToOrder,
  computeItemLineTotal,
  computeOrderAmounts,
  discountedItemAmounts,
  issueCashRemainder,
  parseMoneyInput,
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

  it('parseMoneyInput accepts strings with comma', () => {
    expect(parseMoneyInput('92,95')).toBe(92.95);
    expect(parseMoneyInput(110.5)).toBe(110.5);
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

  it('discountedItemAmounts keeps the order discount on the stored line total', () => {
    expect(
      discountedItemAmounts(
        [{ price: 2, quantity: 100, params: { storedTotalCost: 200 } }],
        10,
      ),
    ).toEqual([180]);
    expect(
      discountedItemAmounts(
        [{ price: 250, quantity: 1, params: { storedTotalCost: 200 } }],
        10,
      ),
    ).toEqual([180]);
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

  it('issue remainder ignores unpaid BePaid and keeps paid prepayment', () => {
    expect(
      issueCashRemainder(100, { prepaymentAmount: 40, prepaymentStatus: 'paid', paymentMethod: 'offline' }),
    ).toBe(60);
    expect(
      issueCashRemainder(100, { prepaymentAmount: 40, prepaymentStatus: 'pending', paymentMethod: 'online' }),
    ).toBe(100);
    expect(
      issueCashRemainder(180, { prepaymentAmount: 0, prepaymentStatus: null, paymentMethod: null }),
    ).toBe(180);
    expect(
      issueCashRemainder(100, { prepaymentAmount: 100, prepaymentStatus: 'paid', paymentMethod: 'offline' }),
    ).toBe(0);
  });
});
