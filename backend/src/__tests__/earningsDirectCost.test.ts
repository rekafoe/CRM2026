import {
  materialDirectCost,
  printDirectCost,
  printUsageFromParams,
  sheetImpressions,
} from '../services/earningsDirectCost'

describe('materialDirectCost', () => {
  it('берёт только закупочную цену', () => {
    const prices = new Map<number, number | null>([[1, 2], [2, null]])
    expect(materialDirectCost([
      { materialId: 1, quantity: 10 },
      { materialId: 2, quantity: 5 },
    ], prices)).toBe(20)
  })
})

describe('print direct cost', () => {
  it('двусторонняя печать считает два оттиска', () => {
    expect(sheetImpressions(4, 2)).toBe(8)
    const usage = printUsageFromParams({
      printTechnology: 'digital',
      sheetsNeeded: 4,
      specifications: { sides: 2 },
    }, 100, 4, 2)
    expect(printDirectCost(usage, [{
      technologyCode: 'digital',
      counterUnit: 'sheets',
      costPerImpression: 0.5,
    }])).toBe(4)
  })

  it('УФ считает м² по включённым слоям', () => {
    const usage = printUsageFromParams({
      printTechnology: 'uv',
      specifications: {
        uv_print: {
          color: { enabled: true, passes: 1 },
          white: { enabled: true, passes: 2 },
          varnish: { enabled: false, passes: 1 },
        },
      },
      customFormat: { width: 1000, height: 1000 },
    }, 2, 0, 1)
    expect(printDirectCost(usage, [{
      technologyCode: 'uv',
      counterUnit: 'm2',
      m2PricingKind: 'uv_flatbed',
      costColorPerM2: 3,
      costWhitePerM2: 4,
      costVarnishPerM2: 9,
    }])).toBe(22)
  })

  it('пустая себестоимость оттиска даёт 0', () => {
    const usage = printUsageFromParams({ sheetsNeeded: 3, printTechnology: 'digital' }, 1, 3, 1)
    expect(printDirectCost(usage, [{
      technologyCode: 'digital',
      counterUnit: 'sheets',
      costPerImpression: null,
    }])).toBe(0)
  })
})
