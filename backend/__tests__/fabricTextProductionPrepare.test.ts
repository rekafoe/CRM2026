import { prepareFabricJsonTextForProduction } from '../src/utils/fabricTextProductionPrepare'

describe('fabricTextProductionPrepare', () => {
  it('hydrates styles from textStyleRuns and widens narrow single-line textbox', () => {
    const input = {
      version: '6.0.0',
      objects: [
        {
          type: 'textbox',
          id: 'text_title',
          left: 10,
          top: 20,
          width: 120,
          fontSize: 36,
          fontFamily: 'Times New Roman',
          text: 'Что я в тебе люблю',
          textStyleRuns: [
            { start: 0, end: 13, fontFamily: 'Times New Roman' },
            { start: 13, end: 18, fontFamily: 'Snell Roundhand' },
          ],
        },
        {
          type: 'textbox',
          id: 'text_item_1',
          left: 30,
          top: 80,
          width: 90,
          fontSize: 28,
          fontFamily: 'Times New Roman',
          text: 'Поддержка',
        },
      ],
    }

    const prepared = prepareFabricJsonTextForProduction(input) as typeof input
    const title = prepared.objects[0] as Record<string, unknown>
    const item = prepared.objects[1] as Record<string, unknown>

    expect(title.styles).toBeTruthy()
    expect(Number(title.width)).toBeGreaterThan(120)
    expect(Number(item.width)).toBeGreaterThan(90)
  })

  it('preserves center origin when widening narrow textbox', () => {
    const input = {
      version: '6.0.0',
      objects: [
        {
          type: 'textbox',
          id: 'text_title',
          left: 200,
          top: 20,
          originX: 'center',
          width: 80,
          fontSize: 36,
          fontFamily: 'Times New Roman',
          text: 'Очень длинный заголовок для проверки',
        },
      ],
    }

    const prepared = prepareFabricJsonTextForProduction(input) as typeof input
    const title = prepared.objects[0] as Record<string, unknown>

    expect(Number(title.width)).toBeGreaterThan(80)
    // center origin: left (center x) must remain unchanged
    expect(Number(title.left)).toBe(200)
  })

  it('shifts left when widening originX:left + textAlign:center', () => {
    const input = {
      version: '6.0.0',
      objects: [
        {
          type: 'textbox',
          id: 'text_client',
          left: 100,
          top: 20,
          originX: 'left',
          textAlign: 'center',
          width: 80,
          fontSize: 36,
          fontFamily: 'Times New Roman',
          text: 'Очень длинный заголовок для проверки',
        },
      ],
    }

    const prepared = prepareFabricJsonTextForProduction(input) as typeof input
    const title = prepared.objects[0] as Record<string, unknown>
    const newW = Number(title.width)
    expect(newW).toBeGreaterThan(80)
    // visual center stays at 100 + 80/2 = 140
    expect(Number(title.left)).toBeCloseTo(100 + (80 - newW) / 2, 5)
  })

  it('does not widen client-added textbox', () => {
    const input = {
      version: '6.0.0',
      objects: [
        {
          type: 'textbox',
          id: 'text_client',
          left: 50,
          top: 20,
          width: 60,
          fontSize: 36,
          text: 'Очень длинный клиентский текст',
          textFieldClientAdded: true,
        },
      ],
    }
    const prepared = prepareFabricJsonTextForProduction(input) as typeof input
    expect(Number(prepared.objects[0].width)).toBe(60)
    expect(Number(prepared.objects[0].left)).toBe(50)
  })
})
