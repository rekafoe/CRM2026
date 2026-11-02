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

  it('extracts kit lines without material_id so checkout can reprice them', () => {
    const line = OrderPricingService.extractPricingLineFromItem({
      id: 9,
      quantity: 3,
      params: {
        productId: 910,
        specifications: {
          type_id: 910004,
          size_id: 910104,
          print_technology: 'laser_sheet',
          print_color_mode: 'color',
          print_sides_mode: 'single',
        },
      },
    });
    expect(line).toMatchObject({
      lineId: 9,
      productId: 910,
      quantity: 3,
    });
    expect(line?.configuration).not.toHaveProperty('material_id');
  });
});
