import { UnifiedPricingService } from '../modules/pricing/services/unifiedPricingService';
import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { getDb } from '../db';

jest.mock('../db', () => ({
  getDb: jest.fn(),
}));

jest.mock('../modules/pricing/services/simplifiedPricingService', () => ({
  SimplifiedPricingService: {
    calculatePrice: jest.fn(),
  },
}));

describe('UnifiedPricingService cover materials for warehouse', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const mockedCalc = SimplifiedPricingService.calculatePrice as jest.MockedFunction<
    typeof SimplifiedPricingService.calculatePrice
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async () => ({ calculator_type: 'simplified' })),
    } as any);
  });

  it('мёржит листы обложки в блок при том же material_id', async () => {
    mockedCalc.mockResolvedValue({
      productId: 1,
      productName: 'Брошюра',
      quantity: 10,
      printPrice: 0,
      materialPrice: 100,
      finishingPrice: 0,
      subtotal: 100,
      finalPrice: 100,
      pricePerUnit: 10,
      calculatedAt: new Date().toISOString(),
      calculationMethod: 'simplified',
      selectedMaterial: {
        material_id: 5,
        material_name: 'SRA3 170',
      },
      materialDetails: {
        tier: { min_qty: 1, price: 1 },
        priceForQuantity: 100,
      },
      layout: {
        fitsOnSheet: true,
        itemsPerSheet: 1,
        sheetsNeeded: 60,
      },
      coverMaterialDetails: {
        material_id: 5,
        material_name: 'SRA3 170',
        sheets: 40,
      },
    } as any);

    const result = await UnifiedPricingService.calculatePrice(1, {}, 10);
    const paper = result.materials.filter((m) => m.materialId === 5);
    expect(paper).toHaveLength(1);
    expect(paper[0].quantity).toBe(100);
  });

  it('отдаёт отдельную строку склада для другой бумаги обложки', async () => {
    mockedCalc.mockResolvedValue({
      productId: 1,
      productName: 'Брошюра',
      quantity: 10,
      printPrice: 0,
      materialPrice: 60,
      finishingPrice: 0,
      subtotal: 60,
      finalPrice: 60,
      pricePerUnit: 6,
      calculatedAt: new Date().toISOString(),
      calculationMethod: 'simplified',
      selectedMaterial: {
        material_id: 5,
        material_name: 'Блок',
      },
      materialDetails: {
        tier: { min_qty: 1, price: 1 },
        priceForQuantity: 60,
      },
      layout: {
        fitsOnSheet: true,
        itemsPerSheet: 1,
        sheetsNeeded: 60,
      },
      coverMaterialDetails: {
        material_id: 99,
        material_name: 'Обложка',
        sheets: 40,
      },
    } as any);

    const result = await UnifiedPricingService.calculatePrice(1, {}, 10);
    expect(result.materials.find((m) => m.materialId === 5)?.quantity).toBe(60);
    expect(result.materials.find((m) => m.materialId === 99)?.quantity).toBe(40);
  });
});
