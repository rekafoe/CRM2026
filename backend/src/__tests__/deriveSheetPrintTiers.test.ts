import {
  itemsPerSheetForDerive,
  perItemPriceFromSheet,
  resolveCentralSheetTiers,
  toProductQtyTiers,
} from '../modules/pricing/utils/deriveSheetPrintTiers'

describe('deriveSheetPrintTiers', () => {
  it('uses positive sheet tiers and ignores the flat column', () => {
    const resolved = resolveCentralSheetTiers(
      [{ min_sheets: 1, max_sheets: 9, price_per_sheet: 1.2 }],
      9,
    )
    expect(resolved.usedFlat).toBe(false)
    expect(resolved.tiers).toHaveLength(1)
    expect(resolved.tiers[0].price_per_sheet).toBe(1.2)
  })

  it('falls back to the flat sheet price when tiers are missing or all zero', () => {
    expect(resolveCentralSheetTiers([], 0.45).usedFlat).toBe(true)
    const zeros = resolveCentralSheetTiers(
      [{ min_sheets: 1, max_sheets: null, price_per_sheet: 0 }],
      0.8,
    )
    expect(zeros.usedFlat).toBe(true)
    expect(zeros.tiers[0]).toMatchObject({ min_sheets: 1, price_per_sheet: 0.8 })
    expect(resolveCentralSheetTiers([], 0).tiers).toHaveLength(0)
  })

  it('keeps a small per-item price instead of rounding it to zero', () => {
    const ips = itemsPerSheetForDerive({
      itemWidthMm: 90,
      itemHeightMm: 50,
      sheetWidthMm: 320,
      sheetHeightMm: 450,
    })
    expect(ips).toBeGreaterThan(1)
    const unit = perItemPriceFromSheet(0.1, ips)
    expect(unit).toBeGreaterThan(0)
    expect(Math.round(unit * ips * 100) / 100).toBeCloseTo(0.1, 2)
  })

  it('converts sheet ranges into product quantity breaks', () => {
    const tiers = toProductQtyTiers(
      [
        { min_sheets: 1, max_sheets: 4, price_per_sheet: 2 },
        { min_sheets: 5, max_sheets: null, price_per_sheet: 1.5 },
      ],
      10,
    )
    expect(tiers).toEqual([
      { min_qty: 10, max_qty: 49, unit_price: 0.2 },
      { min_qty: 50, max_qty: undefined, unit_price: 0.15 },
    ])
  })
})
