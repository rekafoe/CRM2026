import { OrderPricingService } from '../modules/orders/services/orderPricingService';

describe('OrderPricingService.extractPricingLineFromItem', () => {
  it('does not requote custom products even if productId leftover exists', () => {
    expect(
      OrderPricingService.extractPricingLineFromItem({
        id: 1,
        quantity: 2,
        params: { customProduct: true, productId: 12, customName: 'Табличка' },
      })
    ).toBeNull();
  });

  it('does not requote postprint products', () => {
    expect(
      OrderPricingService.extractPricingLineFromItem({
        id: 2,
        quantity: 1,
        params: { postprintProduct: true, productId: 12 },
      })
    ).toBeNull();
  });

  it('does not requote CRM plotter-bare calculator lines', () => {
    expect(
      OrderPricingService.extractPricingLineFromItem({
        id: 3,
        quantity: 1,
        params: { plotterBareProduct: true, productId: 12, storedTotalCost: 0.01 },
      })
    ).toBeNull();
  });
});
