import { computeItemLineTotal } from '../utils/orderAmounts';

/**
 * Order blank / commodity receipt must bill lines via computeItemLineTotal
 * (storedTotalCost), not raw price×qty — same source of truth as CRM totals.
 */
describe('pdf receipt line totals vs storedTotalCost', () => {
  it('prefers storedTotalCost when unit price×qty diverges', () => {
    const item = {
      price: 1.7,
      quantity: 65,
      params: { storedTotalCost: 92.95 },
    };
    const viaPriceQty = Math.round(1.7 * 65 * 100) / 100;
    const viaStored = computeItemLineTotal(item);
    expect(viaPriceQty).toBe(110.5);
    expect(viaStored).toBe(92.95);
  });

  it('applies order discount to stored line total', () => {
    const item = {
      price: 1.7,
      quantity: 65,
      params: { storedTotalCost: 100 },
    };
    const discountPercent = 10;
    const lineSubtotal = computeItemLineTotal(item);
    const afterDiscount = Math.round(lineSubtotal * (1 - discountPercent / 100) * 100) / 100;
    expect(afterDiscount).toBe(90);
  });
});
