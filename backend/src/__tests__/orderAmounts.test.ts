import {
  attachAmountsToOrder,
  clampedPrepaymentAfterTotalDrop,
  computeItemLineTotal,
  computeOrderAmounts,
  discountedItemAmounts,
  issueCashRemainder,
  parseMoneyInput,
} from '../utils/orderAmounts';
import { reconciliationSourceFromOrder } from '../services/reconciliationStatement';

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

  it('issue remainder treats invoice bank transfer as already collected', () => {
    // prepay по счёту: status=bank, method=online — в кассу дня не идёт, но при выдаче остаток 0
    expect(
      issueCashRemainder(250, {
        prepaymentAmount: 250,
        prepaymentStatus: 'bank',
        paymentMethod: 'online',
      }),
    ).toBe(0);
    expect(
      issueCashRemainder(250, {
        prepaymentAmount: 100,
        prepaymentStatus: 'bank',
        paymentMethod: 'online',
      }),
    ).toBe(150);
  });

  it('clamps offline and bank prepaid when total drops; leaves pending BePaid alone', () => {
    expect(
      clampedPrepaymentAfterTotalDrop(
        { prepaymentAmount: 100, prepaymentStatus: 'paid', paymentMethod: 'offline' },
        40,
      ),
    ).toBe(40);
    expect(
      clampedPrepaymentAfterTotalDrop(
        { prepaymentAmount: 200, prepaymentStatus: 'bank', paymentMethod: 'online' },
        75,
      ),
    ).toBe(75);
    expect(
      clampedPrepaymentAfterTotalDrop(
        { prepaymentAmount: 90, prepaymentStatus: 'paid', paymentMethod: 'online' },
        50,
      ),
    ).toBe(50);
    expect(
      clampedPrepaymentAfterTotalDrop(
        { prepaymentAmount: 80, prepaymentStatus: 'pending', paymentMethod: 'online' },
        30,
      ),
    ).toBeNull();
    expect(
      clampedPrepaymentAfterTotalDrop(
        { prepaymentAmount: 40, prepaymentStatus: 'bank', paymentMethod: 'online' },
        100,
      ),
    ).toBeNull();
  });

  it('after clamp, invoice bank no longer invents reconciliation overpayment', () => {
    const before = reconciliationSourceFromOrder({
      id: 21,
      number: 'ORD-21',
      created_at: '2026-11-04',
      totalAmount: 40,
      prepaymentAmount: 200,
      prepaymentStatus: 'bank',
      paymentMethod: 'online',
      paymentChannel: 'invoice',
    });
    expect(before.collected).toBe(200);

    const clamped = clampedPrepaymentAfterTotalDrop(
      { prepaymentAmount: 200, prepaymentStatus: 'bank', paymentMethod: 'online' },
      40,
    );
    expect(clamped).toBe(40);
    const after = reconciliationSourceFromOrder({
      id: 21,
      number: 'ORD-21',
      created_at: '2026-11-04',
      totalAmount: 40,
      prepaymentAmount: clamped,
      prepaymentStatus: 'bank',
      paymentMethod: 'online',
      paymentChannel: 'invoice',
    });
    expect(after.collected).toBe(40);
  });
});
