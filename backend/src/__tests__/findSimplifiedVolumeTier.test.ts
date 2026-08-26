import { findSimplifiedVolumeTier } from '../modules/pricing/services/simplifiedPricingService'
import { billedM2ForQuantity } from '../modules/pricing/services/finishingPerM2'

describe('findSimplifiedVolumeTier', () => {
  const laminateFeedTiers = [
    { min_qty: 1, max_qty: 9, unit_price: 20 },
    { min_qty: 10, max_qty: 49, unit_price: 15 },
    { min_qty: 50, max_qty: undefined, unit_price: 10 },
  ]

  it('picks mid tier for fractional qty stuck in exclusive-integer gap (49.5)', () => {
    // max_qty=49 leaves (49, 50) empty; old code fell back to tiers[0] (20)
    const tier = findSimplifiedVolumeTier(laminateFeedTiers, 49.5)
    expect(tier?.unit_price).toBe(15)
    expect(tier?.min_qty).toBe(10)
  })

  it('still switches at exact integer breaks', () => {
    expect(findSimplifiedVolumeTier(laminateFeedTiers, 9)?.unit_price).toBe(20)
    expect(findSimplifiedVolumeTier(laminateFeedTiers, 10)?.unit_price).toBe(15)
    expect(findSimplifiedVolumeTier(laminateFeedTiers, 50)?.unit_price).toBe(10)
  })

  it('per_m2 tier volume uses billed m² not piece count', () => {
    // 2 banners × ~8 m² each on 1270 roll (1000×2000 trim → 2.54 m² × 2 = 5.08) — not qty=2
    const billedM2 = billedM2ForQuantity({
      rollWidthMm: 1270,
      trimMm: { width: 1000, height: 2000 },
      quantity: 2,
      margins: { edgeMm: 0, gapMm: 0 },
    })
    expect(billedM2).toBeGreaterThan(5)

    const m2Tiers = [
      { min_qty: 1, max_qty: 9, unit_price: 20 },
      { min_qty: 10, max_qty: undefined, unit_price: 15 },
    ]
    // Wrong (piece count): would stay at 20. Correct (m²): still <10 here — use larger job.
    const largeJobM2 = billedM2ForQuantity({
      rollWidthMm: 1270,
      trimMm: { width: 1000, height: 2000 },
      quantity: 5,
      margins: { edgeMm: 0, gapMm: 0 },
    })
    expect(largeJobM2).toBeCloseTo(12.7, 4)
    expect(findSimplifiedVolumeTier(m2Tiers, 5)?.unit_price).toBe(20) // piece count would wrongly stay here for 5 pcs
    expect(findSimplifiedVolumeTier(m2Tiers, largeJobM2)?.unit_price).toBe(15)
  })
})
