import {
  buildCommodityReceiptItemRows,
  plannedPrintStepName,
  receiptPrintLineName,
} from '../services/commodityReceiptLabels'

const laserPlan = {
  steps: [
    { type: 'print', name: 'Лазерная профессиональная печать — Мелованная' },
    { type: 'operation', name: 'Резка' },
  ],
}

const coatedPaper = {
  specifications: { sides: 1, paperDensity: 160 },
  materials: [{ materialName: 'Мелованная', density: 160 }],
  parameterSummary: [{ label: 'Материал', value: 'Мелованная' }],
}

describe('commodity receipt print line', () => {
  it('берёт название шага печати и дописывает плотность', () => {
    const params = { ...coatedPaper, productionPlan: laserPlan }
    expect(plannedPrintStepName(params)).toBe('Лазерная профессиональная печать — Мелованная')
    expect(receiptPrintLineName(params)).toBe(
      'Лазерная профессиональная печать — Мелованная, 160 г/м²',
    )
  })

  it('не повторяет плотность, если она уже есть в названии', () => {
    const params = {
      ...coatedPaper,
      productionPlan: {
        steps: [{ type: 'print', name: 'Лазерная профессиональная печать — Мелованная, 160 г/м²' }],
      },
    }
    expect(receiptPrintLineName(params)).toBe(
      'Лазерная профессиональная печать — Мелованная, 160 г/м²',
    )
  })

  it('без плана оставляет подпись бумаги', () => {
    expect(receiptPrintLineName(coatedPaper)).toBe('Печать односторонняя — Мелованная, 160 г/м²')
  })

  it('на рулоне заменяет голую «Печать» и сохраняет сумму', () => {
    const rows = buildCommodityReceiptItemRows({
      name: 'Наклейки',
      quantity: 10,
      params: {
        ...coatedPaper,
        sheetsNeeded: 0,
        productionPlan: laserPlan,
        services: [
          {
            operationName: 'Печать',
            operationType: 'print',
            quantity: 12.5,
            priceUnit: 'per_m2',
            totalCost: 40,
          },
          {
            operationName: 'Резка',
            operationType: 'cut',
            quantity: 10,
            totalCost: 15,
          },
        ],
      },
    })

    expect(rows).toEqual([
      {
        name: 'Лазерная профессиональная печать — Мелованная, 160 г/м²',
        quantity: 12.5,
        unit: 'шт.',
        totalCost: 40,
      },
      { name: 'Резка', quantity: 10, unit: 'шт.', totalCost: 15 },
    ])
  })

  it('при листах вкладывает стоимость печати в строку технологии и не дублирует её', () => {
    const rows = buildCommodityReceiptItemRows({
      quantity: 100,
      params: JSON.stringify({
        ...coatedPaper,
        sheetsNeeded: 4,
        productionPlan: laserPlan,
        services: [
          {
            operationName: 'Печать',
            operationType: 'print',
            quantity: 4,
            priceUnit: 'per_sheet',
            totalCost: 28,
          },
        ],
      }),
    })

    expect(rows).toEqual([
      {
        name: 'Лазерная профессиональная печать — Мелованная, 160 г/м²',
        quantity: 4,
        unit: 'шт.',
        totalCost: 28,
      },
    ])
  })

  it('без плана по-прежнему пишет бумагу на листах и «Печать» без листов', () => {
    const withSheets = buildCommodityReceiptItemRows({
      params: {
        ...coatedPaper,
        sheetsNeeded: 2,
        services: [{ operationName: 'Печать', operationType: 'print', quantity: 2, totalCost: 11 }],
      },
    })
    expect(withSheets).toEqual([
      {
        name: 'Печать односторонняя — Мелованная, 160 г/м²',
        quantity: 2,
        unit: 'шт.',
        totalCost: 11,
      },
    ])

    const roll = buildCommodityReceiptItemRows({
      params: {
        sheetsNeeded: 0,
        services: [{ operationName: 'Печать', operationType: 'print', quantity: 3, totalCost: 9 }],
      },
    })
    expect(roll).toEqual([{ name: 'Печать', quantity: 3, unit: 'шт.', totalCost: 9 }])
  })

  it('не подменяет названия слоёв УФ одной строкой плана', () => {
    const rows = buildCommodityReceiptItemRows({
      params: {
        sheetsNeeded: 0,
        productionPlan: { steps: [{ type: 'print', name: 'УФ-печать — Плёнка' }] },
        services: [
          { operationName: 'Белый', operationType: 'print', quantity: 1, totalCost: 5 },
          { operationName: 'Цвет', operationType: 'print', quantity: 1, totalCost: 9 },
        ],
      },
    })
    expect(rows.map((row) => row.name)).toEqual(['Белый', 'Цвет'])
    expect(rows.map((row) => row.totalCost)).toEqual([5, 9])
  })

  it('склеивает строку, даже если в названии шага нет слова «печать»', () => {
    const rows = buildCommodityReceiptItemRows({
      params: {
        sheetsNeeded: 2,
        productionPlan: { steps: [{ type: 'print', name: 'УФ — плёнка' }] },
        services: [{ operationName: 'Печать', operationType: 'print', quantity: 2, totalCost: 7 }],
      },
    })
    expect(rows).toEqual([{ name: 'УФ — плёнка', quantity: 2, unit: 'шт.', totalCost: 7 }])
  })
})
