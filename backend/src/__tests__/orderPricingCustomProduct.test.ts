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

  it('still extracts a pricing line when group-key fields are incomplete', () => {
    const line = OrderPricingService.extractPricingLineFromItem({
      id: 3,
      quantity: 100,
      params: {
        productId: 22,
        // no material_id / print_technology / print_color_mode / print_sides_mode
        priceType: 'standard',
      },
    });
    expect(line).not.toBeNull();
    expect(line?.productId).toBe(22);
    expect(line?.quantity).toBe(100);
  });
});
