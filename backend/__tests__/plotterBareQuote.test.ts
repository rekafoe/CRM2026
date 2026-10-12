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
    const cut = quote.lines.find((line) => line.key === 'cut')!
    expect(cut.unit).toBe('м²')
    expect(cut.quantity).toBeCloseTo(1)
    expect(cut.total).toBeCloseTo(10)
    const weeding = quote.lines.find((line) => line.key === 'weeding')!
    expect(weeding.unit).toBe('м²')
    expect(weeding.quantity).toBeCloseTo(0.02)
    expect(weeding.total).toBeCloseTo(0.06)
    expect(quote.lines.find((line) => line.key === 'proof')!.unit).toBe('шт')
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

  test('without material the quote is cut only, by area', () => {
    const quote = quoteBarePlotter({
      widthMm: 1000,
      heightMm: 1000,
      quantity: 1,
      mode: 'roll',
      rollWidthMm: 0,
      sheetWidthMm: 0,
      sheetHeightMm: 0,
      materialPrice: 20,
      materialName: '',
      tariff: tariff({ cut_level_rules: [], price_per_meter: 5, min_quantity: 0.001 }),
      weeding: false,
      mounting: false,
      proof: false,
      includeMaterial: false,
    });
    expect(quote.lines.map((line) => line.key)).toEqual(['cut']);
    expect(quote.lines[0].unit).toBe('м²');
    expect(quote.lines[0].quantity).toBeCloseTo(1);
    expect(quote.lines[0].total).toBeCloseTo(5);
  });

  test('roll cut bills at least 1.2 m by 0.25 m', () => {
    const quote = quoteBarePlotter({
      widthMm: 50,
      heightMm: 50,
      quantity: 1,
      mode: 'roll',
      rollWidthMm: 1200,
      sheetWidthMm: 0,
      sheetHeightMm: 0,
      materialPrice: 0,
      materialName: 'Плёнка',
      tariff: tariff({ cut_level_rules: [], min_quantity: 0, price_per_meter: 10 }),
      weeding: true,
      mounting: true,
      proof: false,
    })
    const cut = quote.lines.find((line) => line.key === 'cut')!
    expect(cut.quantity).toBeCloseTo(0.3)
    expect(cut.total).toBeCloseTo(3)
    const weeding = quote.lines.find((line) => line.key === 'weeding')!
    expect(weeding.quantity).toBeCloseTo(0.0025)
    expect(weeding.total).toBeCloseTo(0)
    const mounting = quote.lines.find((line) => line.key === 'mounting')!
    expect(mounting.quantity).toBeCloseTo(0.0025)
    expect(mounting.total).toBeCloseTo(0.01)
  })

  test('weeding uses the level multiplier and an area tier, mounting does not', () => {
    const shared = {
      widthMm: 1000,
      heightMm: 1000,
      quantity: 1,
      mode: 'roll' as const,
      rollWidthMm: 1200,
      sheetWidthMm: 0,
      sheetHeightMm: 0,
      materialPrice: 0,
      materialName: 'Плёнка',
      weeding: true,
      mounting: true,
      proof: false,
      levelMultiplier: 3,
      levelName: '3-й',
    }
    const quote = quoteBarePlotter({
      ...shared,
      tariff: tariff({
        cut_level_rules: [],
        min_quantity: 0,
        price_per_meter: 5,
        weeding_tiers: [
          { min_quantity: 0, price_per_unit: 10 },
          { min_quantity: 0.5, price_per_unit: 4 },
        ],
        mounting_tiers: [{ min_quantity: 0, price_per_unit: 2 }],
      }),
    })
    expect(quote.lines.find((line) => line.key === 'cut')!.total).toBeCloseTo(15)
    expect(quote.lines.find((line) => line.key === 'weeding')!.unitPrice).toBeCloseTo(12)
    expect(quote.lines.find((line) => line.key === 'weeding')!.total).toBeCloseTo(12)
    expect(quote.lines.find((line) => line.key === 'mounting')!.unitPrice).toBeCloseTo(2)
    expect(quote.lines.find((line) => line.key === 'mounting')!.total).toBeCloseTo(2)

    const small = quoteBarePlotter({
      ...shared,
      widthMm: 500,
      heightMm: 500,
      levelMultiplier: 1,
      tariff: tariff({
        cut_level_rules: [],
        min_quantity: 0,
        weeding_tiers: [
          { min_quantity: 0, price_per_unit: 10 },
          { min_quantity: 0.5, price_per_unit: 4 },
        ],
      }),
    })
    expect(small.lines.find((line) => line.key === 'weeding')!.total).toBeCloseTo(2.5)
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
