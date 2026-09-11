import { smoothedSheetPrintTotal } from '../modules/pricing/utils/smoothedSheetPrintTotal'

describe('smoothedSheetPrintTotal', () => {
  const ips = 10
  const postcardTiers = [
    { min_qty: 300, unit_price: 130 },
    { min_qty: 500, unit_price: 91 },
  ]

  it('на порогах оставляет цену ступени: 30 и 50 листов', () => {
    expect(smoothedSheetPrintTotal(30, postcardTiers, ips)).toBeCloseTo(30 * 130 * ips, 6)
    expect(smoothedSheetPrintTotal(50, postcardTiers, ips)).toBeCloseTo(50 * 91 * ips, 6)
  })

  it('между порогами интерполирует итог, а не держит дорогой тариф до 49 листов', () => {
    const at40 = smoothedSheetPrintTotal(40, postcardTiers, ips)
    const discrete40 = 40 * 130 * ips
    const at50 = 50 * 91 * ips
    expect(at40).toBeCloseTo((30 * 130 * ips + at50) / 2, 6)
    expect(at40).toBeLessThan(discrete40)
    expect(at40).toBeLessThan(at50)
  })

  it('не даёт меньшему тиражу стоить дороже большего, если скидка слишком крутая', () => {
    const steep = [
      { min_qty: 300, unit_price: 200 },
      { min_qty: 500, unit_price: 50 },
    ]
    const at30 = smoothedSheetPrintTotal(30, steep, ips)
    const at50 = smoothedSheetPrintTotal(50, steep, ips)
    expect(at30).toBeCloseTo(at50!, 6)
    expect(at30).toBeLessThan(30 * 200 * ips)
    expect(smoothedSheetPrintTotal(40, steep, ips)).toBeCloseTo(at50!, 6)
  })

  it('после последнего порога продолжает последний тариф за лист', () => {
    expect(smoothedSheetPrintTotal(60, postcardTiers, ips)).toBeCloseTo(60 * 91 * ips, 6)
  })

  it('игнорирует нулевые ступени, чтобы не обнулить печать', () => {
    const mixed = [
      { min_qty: 10, unit_price: 0 },
      { min_qty: 300, unit_price: 130 },
      { min_qty: 500, unit_price: 91 },
    ]
    expect(smoothedSheetPrintTotal(30, mixed, ips)).toBeCloseTo(30 * 130 * ips, 6)
  })
})
