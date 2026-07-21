import { buildImportedSvgTemplateDocument, fabricTextFromSvgText } from '../src/services/designTemplateSvgImportBuilder'

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

  it('конвертирует decor_* и безымянные фигуры в fabric-объекты', () => {
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
    expect(decorObjects).toHaveLength(4)
    expect(decorObjects.map((obj) => obj.type).sort()).toEqual(['circle', 'path', 'rect', 'rect'])
    expect(decorObjects.some((obj) => obj.id === 'decor_auto_rect_1')).toBe(true)
    expect(warnings.some((w) => w.includes('без интерактивного префикса') && w.includes('decor_*'))).toBe(false)
  })

  it('скейлит path-decor с group transform до размера scene', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 90 50">
  <g transform="translate(5 0) scale(2)">
    <path id="decor_scaled" d="M 10 10 L 20 10 L 20 15 Z" fill="#0000ff"/>
  </g>
</svg>`
    const doc = buildImportedSvgTemplateDocument({
      buffer: Buffer.from(svg, 'utf8'),
      originalname: 'decor-scale.svg',
      mimetype: 'image/svg+xml',
    }, 'decor-scale', [])
    const page = doc.pages[0]!
    const decor = page.parsed.interactiveLayers.find(
      (layer) => layer.kind === 'decor' && layer.data.name === 'decor_scaled',
    )
    expect(decor?.kind).toBe('decor')
    if (decor?.kind !== 'decor') return

    const pathObj = page.designPage.fabricJSON.objects.find((obj) => obj.id === 'decor_scaled') as {
      width?: number
      height?: number
      scaleX?: number
      scaleY?: number
    } | undefined
    expect(pathObj).toBeDefined()
    const visualW = Number(pathObj!.width) * Number(pathObj!.scaleX ?? 1)
    const visualH = Number(pathObj!.height) * Number(pathObj!.scaleY ?? 1)
    expect(visualW).toBeCloseTo(decor.data.scene.width, 4)
    expect(visualH).toBeCloseTo(decor.data.scene.height, 4)
    expect(decor.data.svg.width).toBeCloseTo(20, 5)
    expect(decor.data.svg.height).toBeCloseTo(10, 5)
  })

  it('сохраняет порядок fabric-объектов при нескольких decor_id и смешанных слоях', () => {
    const warnings: string[] = []
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 90 50">
  <rect id="photo_main" x="0" y="0" width="90" height="50"/>
  <rect id="decor_id" x="5" y="5" width="20" height="10" fill="#cccccc"/>
  <text id="text_title" x="10" y="30" font-size="12">Title</text>
  <rect id="decor_id" x="60" y="35" width="20" height="10" fill="#999999"/>
</svg>`
    const doc = buildImportedSvgTemplateDocument({
      buffer: Buffer.from(svg, 'utf8'),
      originalname: 'decor-z.svg',
      mimetype: 'image/svg+xml',
    }, 'decor-z', warnings)
    const objects = doc.pages[0]!.designPage.fabricJSON.objects
    expect(objects.map((obj) => String(obj.id))).toEqual([
      'photo_main',
      'decor_id',
      'text_title',
      'decor_id_2',
    ])
    const decorObjects = objects.filter((obj) => String(obj.id).startsWith('decor_'))
    expect(decorObjects.every((obj) => obj.isDecorElement === true)).toBe(true)
    expect(decorObjects[0]?.decorLayerName).toBe('decor_id')
    expect(decorObjects[1]?.decorLayerName).toBe('decor_id')
  })
})
