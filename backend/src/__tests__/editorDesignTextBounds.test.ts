import {
  checkTextSceneBoxOverflow,
  designPageBoundsFromDesignState,
  estimateTextSceneBox,
} from '../services/editorDesignTextBounds'

describe('editorDesignTextBounds', () => {
  const bounds = designPageBoundsFromDesignState({
    pageWidth: 90,
    pageHeight: 50,
    prepress: { safeZoneMm: 5 },
    sceneScale: 1,
  })!

  it('detects single-line i-text wider than page', () => {
    const box = estimateTextSceneBox({
      type: 'i-text',
      left: 10,
      top: 10,
      fontSize: 40,
      text: 'Очень длинная надпись для визитки клиента',
      scaleX: 1,
      scaleY: 1,
    })!
    const overflow = checkTextSceneBoxOverflow(box, bounds)
    expect(overflow.outsidePage || overflow.outsideSafeZone).toBe(true)
  })

  it('textbox wraps within fixed width', () => {
    const box = estimateTextSceneBox({
      type: 'textbox',
      left: 20,
      top: 20,
      width: 200,
      fontSize: 18,
      lineHeight: 1.2,
      text: 'Длинный текст который должен переноситься на несколько строк внутри блока',
      scaleX: 1,
      scaleY: 1,
    })!
    expect(box.width).toBeLessThanOrEqual(210)
    expect(box.height).toBeGreaterThan(18)
  })
})
