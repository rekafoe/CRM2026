import { getDb } from '../db'
import {
  calculateRollWideM2Price,
  deriveQtyTiersFromTotalM2,
  lookupRollWideM2Tier,
  RollWideM2PricingService,
  trimFitsRollPrintWidth,
  type RollWideM2Rates,
} from '../modules/pricing/services/rollWideM2PricingService'

jest.mock('../db', () => ({
  getDb: jest.fn(),
}))

const baseRates: RollWideM2Rates = {
  printPriceId: 10,
  technologyCode: 'inkjet_solvent',
  price_color_per_m2: 22,
  min_charge: 15,
  max_width_mm: 1600,
  max_height_mm: 50000,
  supports_bw: false,
  m2PricingKind: 'roll_wide',
  tiers: [
    { min_m2: 0, max_m2: 2, price_per_m2: 20 },
    { min_m2: 2, max_m2: 10, price_per_m2: 18 },
    { min_m2: 10, max_m2: null, price_per_m2: 16 },
  ],
}

describe('rollWideM2PricingService helpers', () => {
  it('lookupRollWideM2Tier returns matching range', () => {
    expect(lookupRollWideM2Tier(baseRates.tiers, 1.5)?.price_per_m2).toBe(20)
    expect(lookupRollWideM2Tier(baseRates.tiers, 2.0)?.price_per_m2).toBe(18)
    expect(lookupRollWideM2Tier(baseRates.tiers, 2.001)?.price_per_m2).toBe(18)
    expect(lookupRollWideM2Tier(baseRates.tiers, 12)?.price_per_m2).toBe(16)
  })

  it('calculateRollWideM2Price uses tier rate and total_m2', () => {
    const result = calculateRollWideM2Price({
      trimWidthMm: 1000,
      trimHeightMm: 1000,
      quantity: 3,
      rates: { ...baseRates, min_charge: 0 },
    })
    expect(result.pieceAreaM2).toBeCloseTo(1, 5)
    expect(result.totalM2).toBeCloseTo(3, 5)
    expect(result.ratePerM2).toBe(18)
    expect(result.printPrice).toBeCloseTo(54, 2)
    expect(result.minChargeApplied).toBe(false)
  })

  it('calculateRollWideM2Price falls back to base color rate when tiers are absent', () => {
    const result = calculateRollWideM2Price({
      trimWidthMm: 1000,
      trimHeightMm: 1000,
      quantity: 1,
      rates: { ...baseRates, tiers: [], min_charge: 0 },
    })
    expect(result.ratePerM2).toBe(22)
    expect(result.printPrice).toBeCloseTo(22, 2)
  })

  it('calculateRollWideM2Price applies min_charge for tiny jobs', () => {
    const result = calculateRollWideM2Price({
      trimWidthMm: 100,
      trimHeightMm: 100,
      quantity: 1,
      rates: baseRates,
    })
    expect(result.totalM2).toBeCloseTo(0.01, 5)
    expect(result.minChargeApplied).toBe(true)
    expect(result.printPrice).toBe(15)
  })

  it('кладёт изделие поперёк рулона и не требует стол 600×900', () => {
    expect(trimFitsRollPrintWidth(1000, 4000, 1200)).toBe(true)
    expect(trimFitsRollPrintWidth(4000, 1100, 1200)).toBe(true)
    expect(trimFitsRollPrintWidth(1300, 800, 1200)).toBe(true)
    expect(trimFitsRollPrintWidth(1300, 2000, 1200)).toBe(false)
  })

  it('deriveQtyTiersFromTotalM2 converts total_m2 tiers into qty ranges', () => {
    const qtyTiers = deriveQtyTiersFromTotalM2(baseRates.tiers, 0.5)
    expect(qtyTiers).toEqual([
      { min_qty: 1, max_qty: 3, unit_price: 10, source_min_m2: 0, source_max_m2: 2 },
      { min_qty: 4, max_qty: 19, unit_price: 9, source_min_m2: 2, source_max_m2: 10 },
      { min_qty: 20, max_qty: undefined, unit_price: 8, source_min_m2: 10, source_max_m2: null },
    ])
  })
})

describe('roll wide print width from printer', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>

  function mockDb(printerWidth: number | null) {
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM printers')) {
          return { max_width_mm: printerWidth }
        }
        if (query.includes('FROM print_prices')) {
          return {
            id: 10,
            technology_code: 'inkjet_solvent',
            price_color_per_m2: 22,
            min_charge: 0,
            max_width_mm: 600,
            max_height_mm: 900,
            m2_pricing_kind: 'roll_wide',
            supports_bw: 0,
          }
        }
        return null
      }),
      all: jest.fn(async () => []),
    } as any)
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('пропускает размер шире стола УФ, если он влезает в ширину принтера', async () => {
    mockDb(1200)
    const result = await RollWideM2PricingService.calculate({
      technologyCode: 'inkjet_solvent',
      trimWidthMm: 1000,
      trimHeightMm: 4000,
      quantity: 1,
    })
    expect(result.printPrice).toBeCloseTo(88, 2)
  })

  it('отказывает, когда обе стороны шире принтера', async () => {
    mockDb(1200)
    await expect(
      RollWideM2PricingService.calculate({
        technologyCode: 'inkjet_solvent',
        trimWidthMm: 1300,
        trimHeightMm: 2000,
        quantity: 1,
      }),
    ).rejects.toThrow('не помещается в ширину печати 1200 мм')
  })

  it('просит ширину принтера и не подставляет 600×900', async () => {
    mockDb(null)
    await expect(
      RollWideM2PricingService.calculate({
        technologyCode: 'inkjet_solvent',
        trimWidthMm: 100,
        trimHeightMm: 100,
        quantity: 1,
      }),
    ).rejects.toThrow('Макс. ширина, мм')
  })
})
