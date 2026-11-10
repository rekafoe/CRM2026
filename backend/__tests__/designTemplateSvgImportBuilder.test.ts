import {
  buildImportedSvgTemplateDocument,
  fabricTextFromSvgText,
  resolveImportedTemplateSceneScale,
} from '../src/services/designTemplateSvgImportBuilder'
import { parseImportedSvgLayers } from '../src/services/designTemplateSvgParse'

describe('resolveImportedTemplateSceneScale', () => {
  it('даёт scale=6 для визиток и 3 для крупных форматов', () => {
    expect(resolveImportedTemplateSceneScale(50, 90)).toBe(6)
    expect(resolveImportedTemplateSceneScale(90, 50)).toBe(6)
    expect(resolveImportedTemplateSceneScale(210, 297)).toBe(3)
  })
})

describe('fabricTextFromSvgText', () => {
  it('использует data-crm-ascent для top вместо magic 0.8', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <text id="text_title" x="10" y="20" font-size="10" data-crm-ascent="0.6">Title</text>
</svg>`
    const item = parseImportedSvgLayers(svg, { sceneScale: 3 }).textItems[0]!
    const fabric = fabricTextFromSvgText(item) as unknown as Record<string, number>
    expect(fabric.top).toBeCloseTo(item.scene.y - item.scene.fontSize * 0.6, 5)
  })

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

  it('подставляет Arial, если font-family в SVG отсутствует', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <text id="text_voguella" x="80" y="220" font-size="48">Имя</text>
</svg>`
    const item = parseImportedSvgLayers(svg).textItems[0]
    expect(item).toBeDefined()
    const fabric = fabricTextFromSvgText(item!) as Record<string, unknown>
    expect(fabric.fontFamily).toBe('Arial')
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

  it('кладёт круглое photo_* в редактор эллипсом, а не прямоугольником с тем же номером', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <circle id="photo_avatar" cx="40" cy="25" r="10"/>
  <polygon id="photo_badge" points="10,40 22,40 16,48"/>
</svg>`
    const doc = buildImportedSvgTemplateDocument({
      buffer: Buffer.from(svg, 'utf8'),
      originalname: 'photo-shapes.svg',
      mimetype: 'image/svg+xml',
    }, 'photo-shapes', [])
    const objects = doc.pages[0]!.designPage.fabricJSON.objects
    const avatar = objects.find((obj) => obj.id === 'photo_avatar') as Record<string, unknown>
    const badge = objects.find((obj) => obj.id === 'photo_badge') as Record<string, unknown>
    expect(avatar.isPhotoField).toBe(true)
    expect(avatar.photoFieldShape).toBe('ellipse')
    expect(avatar.rx).toBe(Number(avatar.width) / 2)
    expect(avatar.ry).toBe(Number(avatar.height) / 2)
    expect(badge.photoFieldShape).toBe('path')
    expect(String(badge.photoFieldClipPath)).toMatch(/^M /)
    expect(objects.some((obj) => String(obj.id).startsWith('decor_'))).toBe(false)
  })

  it('кладёт кривую photo_* в clip и не скругляет острый прямоугольник', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50" style="fill-rule:evenodd">
  <rect id="photo_sharp" x="0" y="0" width="20" height="10"/>
  <path id="photo_wave" fill-rule="evenodd" d="M 10 10 C 20 0 30 20 40 10 L 40 30 L 10 30 Z"/>
</svg>`
    const doc = buildImportedSvgTemplateDocument({
      buffer: Buffer.from(svg, 'utf8'),
      originalname: 'photo-curve.svg',
      mimetype: 'image/svg+xml',
    }, 'photo-curve', [])
    const objects = doc.pages[0]!.designPage.fabricJSON.objects
    const sharp = objects.find((obj) => obj.id === 'photo_sharp') as Record<string, unknown>
    const wave = objects.find((obj) => obj.id === 'photo_wave') as Record<string, unknown>
    expect(sharp.photoFieldShape).toBe('rect')
    expect(sharp.photoFieldClipPath).toBeUndefined()
    expect(sharp.rx).toBe(0)
    expect(sharp.ry).toBe(0)
    expect(wave.photoFieldShape).toBe('path')
    expect(String(wave.photoFieldClipPath)).toMatch(/C /)
    expect(wave.photoFieldFillRule).toBe('evenodd')
    expect(wave.type).toBe('rect')
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

  it('конвертирует decor_* PNG/JPG image в fabric type=image', () => {
    const pngData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 90 50">
  <image id="decor_logo" x="10" y="10" width="20" height="15" href="${pngData}"/>
</svg>`
    const doc = buildImportedSvgTemplateDocument({
      buffer: Buffer.from(svg, 'utf8'),
      originalname: 'decor-image.svg',
      mimetype: 'image/svg+xml',
    }, 'decor-image', [])
    const img = doc.pages[0]!.designPage.fabricJSON.objects.find((obj) => obj.id === 'decor_logo') as {
      type?: string
      src?: string
      width?: number
      height?: number
      isDecorElement?: boolean
    } | undefined
    expect(img?.type).toBe('image')
    expect(img?.isDecorElement).toBe(true)
    expect(img?.src?.startsWith('data:image/png')).toBe(true)
    expect(Number(img?.width)).toBeGreaterThan(0)
    expect(Number(img?.height)).toBeGreaterThan(0)
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

  it('переносит fill-rule evenodd из корневого <svg style> на составной decor_ path Corel', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="61mm" height="92mm" viewBox="0 0 6100 9200" style="fill-rule:evenodd; clip-rule:evenodd">
  <defs>
    <style type="text/css">
      .fil1 {fill:#B32621}
      .fil2 {fill:#B7CBD8;fill-rule:nonzero}
    </style>
  </defs>
  <g id="Layer_1">
    <path id="decor_" class="fil1" d="M1284.21 996.58l0 0c106.44,0 193.51,87.07 193.51,193.51l0 528.23c0,106.44 -87.07,193.51 -193.51,193.51l0 0c-106.44,0 -193.51,-87.07 -193.51,-193.51l0 -528.23c0,-106.44 87.07,-193.51 193.51,-193.51zm0 99.97l0 0c66.17,0 120.29,54.16 120.29,120.29l0 481.61c0,66.12 -54.12,120.29 -120.29,120.29l0 0c-66.17,0 -120.29,-54.13 -120.29,-120.29l0 -481.61c0,-66.17 54.12,-120.29 120.29,-120.29z"/>
    <path id="decor__2" class="fil2" d="M10 10 L100 10 L100 100 Z"/>
  </g>
</svg>`
    const doc = buildImportedSvgTemplateDocument({
      buffer: Buffer.from(svg, 'utf8'),
      originalname: '1,1-17.svg',
      mimetype: 'image/svg+xml',
    }, 'card-17', [])
    const objects = doc.pages[0]!.designPage.fabricJSON.objects as Array<{
      id?: string
      decorLayerName?: string
      fillRule?: string
    }>
    const digit = objects.find((obj) => obj.decorLayerName === 'decor_')
    const stripe = objects.find((obj) => obj.id === 'decor__2')
    expect(digit?.id).toBe('decor_1')
    expect(digit?.fillRule).toBe('evenodd')
    expect(stripe?.fillRule).toBe('nonzero')
  })

  it('читает семейство и начертание (OS/2 weight + italic) из TTF внутри ZIP и сохраняет полное превью', () => {
    const PizZip = require('pizzip') as new () => {
      file: (name: string, data: string | Buffer) => void
      generate: (opts: { type: 'nodebuffer' }) => Buffer
    }
    const u16 = (n: number) => {
      const b = Buffer.alloc(2)
      b.writeUInt16BE(n)
      return b
    }
    const u32 = (n: number) => {
      const b = Buffer.alloc(4)
      b.writeUInt32BE(n >>> 0)
      return b
    }
    const utf16 = (s: string) => {
      const b = Buffer.alloc(s.length * 2)
      for (let i = 0; i < s.length; i += 1) b.writeUInt16BE(s.charCodeAt(i), i * 2)
      return b
    }
    const fam = utf16('TestCardDisplay')
    const sub = utf16('Bold Italic')
    const nameTbl = Buffer.concat([
      u16(0), u16(2), u16(6 + 24),
      u16(3), u16(1), u16(0x0409), u16(1), u16(fam.length), u16(0),
      u16(3), u16(1), u16(0x0409), u16(2), u16(sub.length), u16(fam.length),
      fam, sub,
    ])
    const os2Tbl = Buffer.alloc(64)
    os2Tbl.writeUInt16BE(700, 4)
    os2Tbl.writeUInt16BE(1, 62)
    const dirOffset = 12 + 32
    const sfntBuf = Buffer.concat([
      u32(0x00010000), u16(2), u16(0), u16(0), u16(0),
      Buffer.from('OS/2', 'ascii'), u32(0), u32(dirOffset), u32(os2Tbl.length),
      Buffer.from('name', 'ascii'), u32(0), u32(dirOffset + os2Tbl.length), u32(nameTbl.length),
      os2Tbl,
      nameTbl,
    ])

    const zip = new PizZip()
    zip.file('fonts/file_01.ttf', sfntBuf)
    zip.file(
      '1.svg',
      `<svg xmlns="http://www.w3.org/2000/svg" width="61mm" height="92mm" viewBox="0 0 610 920">`
      + `<rect id="photo_" x="50" y="50" width="510" height="820" fill="#cccccc"/>`
      + `<text id="text_title" x="100" y="100" font-family="TestCardDisplay Bold" font-size="24">Карта</text>`
      + `</svg>`,
    )

    const warnings: string[] = []
    const doc = buildImportedSvgTemplateDocument({
      buffer: zip.generate({ type: 'nodebuffer' }),
      originalname: 'cards-with-font.zip',
      mimetype: 'application/zip',
    }, 'cards-zip', warnings)

    expect(doc.bundledFonts).toHaveLength(1)
    expect(doc.bundledFonts[0]).toMatchObject({
      family: 'TestCardDisplay',
      weight: '700',
      style: 'italic',
    })
    const textObj = doc.pages[0]!.designPage.fabricJSON.objects.find((obj) => obj.id === 'text_title') as {
      fontFamily?: string
      fontWeight?: string
      fontStyle?: string
    } | undefined
    expect(textObj).toMatchObject({
      fontFamily: 'TestCardDisplay',
      fontWeight: '700',
      fontStyle: 'italic',
    })
    expect(doc.previewUrl).not.toBe(doc.normalizedFileUrl)
    expect(doc.previewUrl).toContain('preview')
  })
})
