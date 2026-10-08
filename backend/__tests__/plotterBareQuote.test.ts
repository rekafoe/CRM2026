import { quoteBarePlotter } from '../src/modules/pricing/services/plotterBareQuote'
import type { PlotterCuttingModeTariffDTO } from '../src/modules/pricing/dtos/plotterCuttingTariff.dto'

function tariff(patch: Partial<PlotterCuttingModeTariffDTO> = {}): PlotterCuttingModeTariffDTO {
  return {
    mode: 'roll',
    label: 'Плоттер',
    price_per_meter: 5,
    meter_basis: 'knife_path',
    min_quantity: 1,
    weeding_tiers: [{ min_quantity: 1, price_per_unit: 1.5 }],
    mounting_tiers: [{ min_quantity: 1, price_per_unit: 2 }],
    proof_tiers: [{ min_quantity: 1, price_per_unit: 0.4 }],
    cut_level_rules: [
      { max_cell_long_side_mm: 100, multiplier: 2, name: 'мелкие' },
      { max_cell_long_side_mm: 9999, multiplier: 1, name: 'крупные' },
    ],
    ...patch,
  }
}

describe('quoteBarePlotter', () => {
  test('roll quotes knife, material meters, and optional operations', () => {
    const quote = quoteBarePlotter({
      widthMm: 100,
      heightMm: 100,
      quantity: 2,
      mode: 'roll',
      rollWidthMm: 1000,
      sheetWidthMm: 0,
      sheetHeightMm: 0,
      materialPrice: 10,
      materialName: 'Oracal',
      tariff: tariff(),
      weeding: true,
      mounting: false,
      proof: true,
    })
    expect(quote.mode).toBe('roll')
    expect(quote.levelName).toBe('мелкие')
    expect(quote.multiplier).toBe(2)
    expect(quote.lines.map((line) => line.key)).toEqual(['cut', 'material', 'weeding', 'proof'])
    expect(quote.lines.find((line) => line.key === 'cut')!.total).toBeGreaterThan(0)
    expect(quote.lines.find((line) => line.key === 'weeding')!.total).toBe(3)
    expect(quote.lines.find((line) => line.key === 'proof')!.total).toBe(0.8)
    expect(quote.total).toBeGreaterThan(quote.lines.find((line) => line.key === 'cut')!.total)
  })

  test('sheet bills sheets when the tariff is per sheet and skips roll operations', () => {
    const quote = quoteBarePlotter({
      widthMm: 400,
      heightMm: 400,
      quantity: 2,
      mode: 'sheet',
      rollWidthMm: 0,
      sheetWidthMm: 320,
      sheetHeightMm: 450,
      materialPrice: 3,
      materialName: 'Бумага',
      tariff: tariff({ mode: 'sheet', meter_basis: 'feed', price_per_meter: 4, cut_level_rules: [] }),
      weeding: true,
      mounting: true,
      proof: true,
    })
    expect(quote.lines.map((line) => line.key)).toEqual(['cut', 'material'])
    expect(quote.lines[0].unit).toBe('лист')
    expect(quote.lines[0].quantity).toBe(2)
    expect(quote.lines[1].quantity).toBe(2)
    expect(quote.warnings.some((line) => line.includes('не помещается'))).toBe(true)
  })

  test('chosen level multiplier overrides the size match', () => {
    const quote = quoteBarePlotter({
      widthMm: 1000,
      heightMm: 1000,
      quantity: 1,
      mode: 'roll',
      rollWidthMm: 1260,
      sheetWidthMm: 0,
      sheetHeightMm: 0,
      materialPrice: 0,
      materialName: 'Плёнка',
      tariff: tariff(),
      weeding: false,
      mounting: false,
      proof: false,
      levelMultiplier: 3,
      levelName: '1-й уровень',
    })
    expect(quote.multiplier).toBe(3)
    expect(quote.levelName).toBe('1-й уровень')
  })
})
