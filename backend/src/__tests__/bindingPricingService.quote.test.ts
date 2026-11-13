import { BindingPricingService } from '../modules/pricing/services/bindingPricingService';
import { PricingServiceRepository } from '../modules/pricing/repositories/serviceRepository';

jest.mock('../modules/pricing/repositories/serviceRepository', () => ({
  PricingServiceRepository: {
    getServiceById: jest.fn(),
    listServiceVariants: jest.fn(),
    listServiceTiers: jest.fn(),
    assertVariantPricingLeaf: jest.fn(),
  },
}));

const getServiceById = PricingServiceRepository.getServiceById as jest.Mock;
const listServiceVariants = PricingServiceRepository.listServiceVariants as jest.Mock;
const listServiceTiers = PricingServiceRepository.listServiceTiers as jest.Mock;
const assertVariantPricingLeaf = PricingServiceRepository.assertVariantPricingLeaf as jest.Mock;

function bindService(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    name: 'Пружина',
    type: 'bind',
    unit: 'шт',
    priceUnit: 'per_item',
    rate: 2,
    isActive: true,
    operationType: 'bind',
    minQuantity: 1,
    ...overrides,
  };
}

describe('BindingPricingService.quoteBinding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServiceById.mockResolvedValue(bindService());
    listServiceVariants.mockResolvedValue([]);
    listServiceTiers.mockResolvedValue([
      { id: 1, serviceId: 7, minQuantity: 1, rate: 4, isActive: true },
      { id: 2, serviceId: 7, minQuantity: 20, rate: 1, isActive: true },
    ]);
    assertVariantPricingLeaf.mockResolvedValue(undefined);
  });

  it('для per_item выбирает ступень по тиражу и умножает ставку на тираж и норму', async () => {
    const quote = await BindingPricingService.quoteBinding({
      serviceId: 7,
      quantity: 10,
      unitsPerItem: 10,
    });

    expect(quote.unitPrice).toBe(4);
    expect(quote.units).toBe(100);
    expect(quote.total).toBe(400);
    expect(quote.priceUnit).toBe('per_item');
  });

  it('для fixed, per_order и per_hour берёт норму один раз', async () => {
    for (const priceUnit of ['fixed', 'per_order', 'per_hour']) {
      getServiceById.mockResolvedValueOnce(bindService({ priceUnit, rate: 3 }));
      const quote = await BindingPricingService.quoteBinding({
        serviceId: 7,
        quantity: 100,
        unitsPerItem: 2,
      });
      expect(quote.priceUnit).toBe(priceUnit);
      expect(quote.units).toBe(2);
      expect(quote.unitPrice).toBe(1);
      expect(quote.total).toBe(2);
    }
  });

  it('для листа, метра, м² и реза отвечает 400', async () => {
    for (const priceUnit of ['per_sheet', 'per_meter', 'per_m2', 'per_cut']) {
      getServiceById.mockResolvedValueOnce(bindService({ priceUnit }));
      await expect(
        BindingPricingService.quoteBinding({ serviceId: 7, quantity: 10 }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it('для per_item режет тираж минимумом и максимумом услуги', async () => {
    getServiceById.mockResolvedValueOnce(bindService({ minQuantity: 10, maxQuantity: 12 }));
    await expect(
      BindingPricingService.quoteBinding({ serviceId: 7, quantity: 5 }),
    ).rejects.toThrow(/не меньше 10/);

    getServiceById.mockResolvedValueOnce(bindService({ minQuantity: 1, maxQuantity: 10 }));
    await expect(
      BindingPricingService.quoteBinding({ serviceId: 7, quantity: 15 }),
    ).rejects.toThrow(/от 1 до 10/);
  });

  it('для fixed не применяет минимум тиража per_item', async () => {
    getServiceById.mockResolvedValueOnce(bindService({ priceUnit: 'fixed', minQuantity: 10, rate: 3 }));
    listServiceTiers.mockResolvedValueOnce([]);
    const quote = await BindingPricingService.quoteBinding({
      serviceId: 7,
      quantity: 1,
      unitsPerItem: 1,
    });
    expect(quote.total).toBe(3);
  });

  it('без листа, когда листья есть, отвечает 400', async () => {
    listServiceVariants.mockResolvedValue([
      { id: 1, variantName: 'Пружина', isActive: true, parentVariantId: null },
      { id: 2, variantName: '8 мм', isActive: true, parentVariantId: 1 },
    ]);
    await expect(
      BindingPricingService.quoteBinding({ serviceId: 7, quantity: 10 }),
    ).rejects.toThrow(/Выберите лист/);
    expect(assertVariantPricingLeaf).not.toHaveBeenCalled();
  });

  it('выключенный вариант не оценивает', async () => {
    listServiceVariants.mockResolvedValue([
      { id: 2, variantName: '8 мм', isActive: false, parentVariantId: null },
    ]);
    await expect(
      BindingPricingService.quoteBinding({ serviceId: 7, variantId: 2, quantity: 10 }),
    ).rejects.toMatchObject({ status: 400, message: 'Вариант переплёта выключен' });
    expect(assertVariantPricingLeaf).not.toHaveBeenCalled();
  });

  it('выключенную услугу не оценивает', async () => {
    getServiceById.mockResolvedValue(bindService({ isActive: false }));
    await expect(
      BindingPricingService.quoteBinding({ serviceId: 7, quantity: 10 }),
    ).rejects.toMatchObject({ status: 400, message: 'Переплёт выключен' });
  });
});
