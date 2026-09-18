import { computeItemLineTotal } from '../utils/orderAmounts';

/**
 * Piecework base must match CRM line totals (storedTotalCost), not raw price×qty.
 * Order-level commercial discount is intentionally not applied here.
 */
describe('earnings line base vs storedTotalCost', () => {
  it('uses storedTotalCost when unit price diverges', () => {
    const row = {
      price: 1.7,
      quantity: 65,
      params: JSON.stringify({ storedTotalCost: 92.95 }),
    };
    const viaPriceQty = (Number(row.price) || 0) * (Number(row.quantity) || 0);
    const viaStored = computeItemLineTotal(row);
    expect(Math.round(viaPriceQty * 100) / 100).toBe(110.5);
    expect(viaStored).toBe(92.95);
  });
});
