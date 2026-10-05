import { splitEqualMoney } from '../services/earningsWasteShare'
import { wasteItemMoney } from '../services/earningsDirectCost'

describe('splitEqualMoney', () => {
  it('40 на четырёх исполнителей даёт по 10', () => {
    expect(splitEqualMoney(40, [4, 1, 2, 3]).map((row) => row.amount)).toEqual([10, 10, 10, 10])
  })

  it('остаток копейки уходит исполнителю с меньшим id', () => {
    const rows = splitEqualMoney(10, [3, 1, 2])
    expect(rows.map((row) => row.amount)).toEqual([3.34, 3.33, 3.33])
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBeCloseTo(10, 2)
  })

  it('без исполнителей доля никому не назначается', () => {
    expect(splitEqualMoney(40, [])).toEqual([])
  })
})

describe('wasteItemMoney', () => {
  const rates = [{
    technologyCode: 'digital',
    counterUnit: 'sheets',
    costPerImpression: 0.5,
  }]

  it('считает оттиски брака и закупку материала на эти листы', () => {
    const prices = new Map<number, number | null>([[1, 2]])
    expect(wasteItemMoney({
      wasteSheets: 4,
      sides: 2,
      itemQuantity: 100,
      itemSheets: 10,
      params: {
        printTechnology: 'digital',
        sheetsNeeded: 10,
        materials: [{ materialId: 1, quantity: 10 }],
        specifications: { sides: 2 },
      },
      purchasePriceById: prices,
      printRates: rates,
    })).toBe(12)
  })

  it('пустая закупка не подменяет отпускную цену', () => {
    const prices = new Map<number, number | null>([[1, null]])
    expect(wasteItemMoney({
      wasteSheets: 4,
      sides: 1,
      itemQuantity: 10,
      itemSheets: 10,
      params: {
        printTechnology: 'digital',
        sheetsNeeded: 10,
        materials: [{ materialId: 1, quantity: 10 }],
      },
      purchasePriceById: prices,
      printRates: rates,
    })).toBe(2)
  })
})
