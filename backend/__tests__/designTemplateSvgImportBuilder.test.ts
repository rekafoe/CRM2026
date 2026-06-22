import { buildImportedSvgTemplateDocument, fabricTextFromSvgText } from '../src/services/designTemplateSvgImportBuilder'
import { parseImportedSvgLayers } from '../src/services/designTemplateSvgParse'

describe('fabricTextFromSvgText', () => {
  it('экспортирует textbox с textStyleRuns без styles', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <style type="text/css"><![CDATA[
    .fnt0 { font-family: 'Voguella'; font-size: 48px; }
    .fnt1 { font-family: 'Ceremonious One'; font-size: 48px; }
  ]]></style>
  <text id="text_love" text-anchor="middle">
    <tspan class="fnt0" x="300" y="120">Что я в тебе </tspan>
    <tspan class="fnt1" x="520" y="120">л</tspan>
    <tspan class="fnt0" x="540" y="120">юблю</tspan>
  </text>
</svg>`
    const item = parseImportedSvgLayers(svg).textItems[0]
    expect(item).toBeDefined()
    const fabric = fabricTextFromSvgText(item!) as Record<string, unknown>
    expect(fabric.type).toBe('textbox')
    expect(fabric.styles).toBeUndefined()
    expect(Array.isArray(fabric.textStyleRuns)).toBe(true)
    const runs = fabric.textStyleRuns as Array<{ fontFamily?: string; start: number; end: number }>
    expect(runs.some((r) => r.fontFamily === 'Ceremonious One')).toBe(true)
    const cer = runs.find((r) => r.fontFamily === 'Ceremonious One')
    expect(cer?.start).toBe(item!.text.indexOf('люблю'))
    expect(cer?.end).toBe(item!.text.length)
  })

  it('даёт достаточную ширину однострочному text_* без принудительного переноса', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <text id="text_title" x="80" y="220" font-size="120" font-family="Times New Roman">ISABELLE MATHERS</text>
</svg>`
    const item = parseImportedSvgLayers(svg).textItems[0]
    expect(item).toBeDefined()
    const fabric = fabricTextFromSvgText(item!) as Record<string, unknown>
    expect(fabric.type).toBe('textbox')
    const width = Number(fabric.width)
    const fontSize = Number(fabric.fontSize)
    expect(Number.isFinite(width)).toBe(true)
    expect(width).toBeGreaterThan(fontSize * String(item!.text).length * 0.6)
  })

  it('падает с кодом лимита по количеству узлов', () => {
    const manyRects = new Array(80050).fill('<rect x="1" y="1" width="1" height="1"/>').join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm">${manyRects}</svg>`
    expect(() => buildImportedSvgTemplateDocument({
      buffer: Buffer.from(svg, 'utf8'),
      originalname: 'huge.svg',
      mimetype: 'image/svg+xml',
    }, 'huge', [])).toThrow('SVG_NODE_COUNT_LIMIT_EXCEEDED')
  })

  it('пробрасывает trace в parsed страницы при включенном режиме', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm"><rect id="photo_1" x="1" y="1" width="10" height="10"/></svg>`
    const doc = buildImportedSvgTemplateDocument({
      buffer: Buffer.from(svg, 'utf8'),
      originalname: 'trace.svg',
      mimetype: 'image/svg+xml',
    }, 'trace', [], { trace: true })
    expect(doc.pages[0]?.parsed.trace?.timeline.length).toBeGreaterThan(0)
  })

  it('добавляет locked_bg только при явном слое locked_bg', () => {
    const withoutLockedBg = `<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm"><rect id="decor_box" x="1" y="1" width="10" height="8"/></svg>`
    const docWithoutBg = buildImportedSvgTemplateDocument({
      buffer: Buffer.from(withoutLockedBg, 'utf8'),
      originalname: 'without-locked-bg.svg',
      mimetype: 'image/svg+xml',
    }, 'without-locked-bg', [])
    expect(docWithoutBg.pages[0]?.parsed.lockedBgDetected).toBe(false)
    expect(docWithoutBg.pages[0]?.designPage.fabricJSON.objects.some((obj) => obj.id === 'locked_bg')).toBe(false)

    const withLockedBg = `<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm"><rect id="locked_bg" x="0" y="0" width="90" height="50"/><rect id="decor_box" x="1" y="1" width="10" height="8"/></svg>`
    const docWithBg = buildImportedSvgTemplateDocument({
      buffer: Buffer.from(withLockedBg, 'utf8'),
      originalname: 'with-locked-bg.svg',
      mimetype: 'image/svg+xml',
    }, 'with-locked-bg', [])
    expect(docWithBg.pages[0]?.parsed.lockedBgDetected).toBe(true)
    expect(docWithBg.pages[0]?.designPage.fabricJSON.objects.some((obj) => obj.id === 'locked_bg')).toBe(true)
  })

  it('конвертирует decor_* в fabric-объекты и пишет warning без locked_bg', () => {
    const warnings: string[] = []
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 90 50">
  <rect id="decor_rect" x="5" y="5" width="20" height="10" fill="#ff0000"/>
  <circle id="decor_circle" cx="45" cy="25" r="6" fill="#00ff00"/>
  <path id="decor_path" d="M 60 10 L 80 10 L 80 20 Z" fill="#0000ff"/>
  <rect x="1" y="1" width="2" height="2" fill="#111111"/>
</svg>`
    const doc = buildImportedSvgTemplateDocument({
      buffer: Buffer.from(svg, 'utf8'),
      originalname: 'decor.svg',
      mimetype: 'image/svg+xml',
    }, 'decor', warnings)
    const objects = doc.pages[0]!.designPage.fabricJSON.objects
    const decorObjects = objects.filter((obj) => String(obj.id).startsWith('decor_'))
    expect(decorObjects).toHaveLength(3)
    expect(decorObjects.map((obj) => obj.type).sort()).toEqual(['circle', 'path', 'rect'])
    expect(warnings.some((w) => w.includes('без интерактивного префикса') && w.includes('decor_*'))).toBe(true)
  })
})
