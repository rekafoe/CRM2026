/**
 * Регрессия: «Пересчитать цены из принтеров» берёт первый материал с sheet_width/height.
 * В шаблоне print_prices общие; unit_price = цена_листа / items_per_sheet(раскладка).
 * Биллинг: pricePerSheet = unit_price × itemsPerSheet(выбранный материал).
 * Разные форматы листа → неверный charge.
 *
 * Хелпер allowedMaterialsHaveDistinctSheetFormats — frontend
 * (derivePrintPricesFromCentral.ts); здесь дублируем чистую логику для jest.
 */

function allowedMaterialsHaveDistinctSheetFormats(
  allMaterials: Array<{ id: number; sheet_width?: number | null; sheet_height?: number | null }> | undefined,
  allowedIds: number[] | undefined,
): boolean {
  if (!allMaterials?.length || !allowedIds?.length) return false
  const formats = new Set<string>()
  for (const rawId of allowedIds) {
    const id = Number(rawId)
    if (!Number.isFinite(id)) continue
    const m = allMaterials.find((x) => Number(x.id) === id)
    const sw = m != null ? Number(m.sheet_width) : 0
    const sh = m != null ? Number(m.sheet_height) : 0
    if (!(sw > 0 && sh > 0)) continue
    const a = Math.min(sw, sh)
    const b = Math.max(sw, sh)
    formats.add(`${a}x${b}`)
  }
  return formats.size > 1
}

describe('derive print prices — distinct sheet formats', () => {
  const materials = [
    { id: 1, sheet_width: 320, sheet_height: 450 }, // SRA3
    { id: 2, sheet_width: 210, sheet_height: 297 }, // A4
    { id: 3, sheet_width: 450, sheet_height: 320 }, // SRA3 rotated
  ]

  it('detects distinct formats among allowed materials', () => {
    expect(allowedMaterialsHaveDistinctSheetFormats(materials, [1, 2])).toBe(true)
  })

  it('treats rotated same format as one format', () => {
    expect(allowedMaterialsHaveDistinctSheetFormats(materials, [1, 3])).toBe(false)
  })

  it('single format or missing dims → false', () => {
    expect(allowedMaterialsHaveDistinctSheetFormats(materials, [1])).toBe(false)
    expect(allowedMaterialsHaveDistinctSheetFormats(materials, [1, 99])).toBe(false)
    expect(allowedMaterialsHaveDistinctSheetFormats(undefined, [1, 2])).toBe(false)
  })

  it('SRA3-derived unit_price undercharges when billed with A4 itemsPerSheet', () => {
    const printerSheetPrice = 2.4
    const ipsSra3 = 24
    const ipsA4 = 10
    const unitPrice = printerSheetPrice / ipsSra3
    const billedPerSheetIfA4 = unitPrice * ipsA4
    expect(billedPerSheetIfA4).toBeCloseTo(1.0, 6)
    expect(billedPerSheetIfA4).toBeLessThan(printerSheetPrice)
    // 10 листов A4: клиент платит 10 вместо 24
    expect(10 * billedPerSheetIfA4).toBeCloseTo(10, 6)
    expect(10 * printerSheetPrice).toBeCloseTo(24, 6)
  })
})
