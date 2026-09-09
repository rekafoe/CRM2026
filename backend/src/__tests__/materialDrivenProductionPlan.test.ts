import { getDb } from '../db'
import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService'
import { UnifiedPricingService } from '../modules/pricing/services/unifiedPricingService'

jest.mock('../db', () => ({
  getDb: jest.fn(),
}))

jest.mock('../modules/pricing/services/simplifiedPricingService', () => ({
  SimplifiedPricingService: {
    calculatePrice: jest.fn(),
  },
}))

describe('material-driven production plan', () => {
  it('returns resolved technology, physical roll and ordered operations', async () => {
    ;(getDb as jest.MockedFunction<typeof getDb>).mockResolvedValue({
      get: jest.fn(async () => ({ calculator_type: 'simplified' })),
    } as any)
    ;(SimplifiedPricingService.calculatePrice as jest.Mock).mockResolvedValue({
      productId: 1,
      productName: 'Стикеры',
      quantity: 100,
      selectedSize: { id: 1, label: '20×30', width_mm: 20, height_mm: 30 },
      selectedPrint: {
        technology_code: 'inkjet_solvent',
        color_mode: 'color',
        sides_mode: 'single',
      },
      selectedMaterial: {
        material_id: 55,
        material_name: 'Oracal матовая',
      },
      resolvedMaterialPrint: {
        usageContext: 'outdoor',
        requestedMaterialId: 50,
        materialTypeId: 7,
        materialKind: 'roll',
        selectedMaterialId: 55,
        selectedMaterialName: 'Oracal матовая',
        selectedMaterialWidthMm: 630,
        selectedMaterialHeightMm: null,
        availableQuantity: 20,
        requiredQuantity: 1.2,
        stockSufficient: true,
        technologyCode: 'inkjet_solvent',
        technologyName: 'Сольвентная',
        pricingMode: 'per_meter',
        m2PricingKind: null,
        warnings: [],
      },
      printPrice: 20,
      materialPrice: 10,
      finishingPrice: 5,
      subtotal: 35,
      finalPrice: 35,
      pricePerUnit: 0.35,
      printDetails: {
        tier: { min_qty: 1, price: 20 },
        priceForQuantity: 20,
      },
      materialDetails: {
        tier: { min_qty: 1, price: 10 },
        priceForQuantity: 10,
      },
      finishingDetails: [
        {
          service_id: 9,
          service_name: 'Плоттерная резка',
          tier: { min_qty: 1, price: 5 },
          units_needed: 1.2,
          priceForQuantity: 5,
          price_unit: 'per_meter',
        },
      ],
      calculatedAt: new Date().toISOString(),
      calculationMethod: 'simplified',
      layout: {
        fitsOnSheet: true,
        itemsPerSheet: 1,
        sheetsNeeded: 0,
        metersNeeded: 1.2,
      },
    })

    const result = await UnifiedPricingService.calculatePrice(
      1,
      { size_id: 1, material_id: 50, usage_context: 'outdoor' },
      100,
    )

    expect(result.productionPlan).toMatchObject({
      usageContext: 'outdoor',
      technologyCode: 'inkjet_solvent',
      materialId: 55,
      materialWidthMm: 630,
      stockSufficient: true,
      colorMode: 'color',
      sidesMode: 'single',
    })
    expect(result.productionPlan?.steps.map((step) => step.name)).toEqual([
      'Сольвентная печать — Oracal матовая, рулон 630 мм',
      'Плоттерная резка',
    ])
  })
})
