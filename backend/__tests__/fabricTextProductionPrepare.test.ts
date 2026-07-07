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
    expect(Number(title.left)).toBeLessThan(200)
  })
})
