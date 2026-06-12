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
})
