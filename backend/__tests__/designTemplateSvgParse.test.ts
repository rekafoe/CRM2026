import { parseImportedSvgLayers } from '../src/services/designTemplateSvgParse'

describe('parseImportedSvgLayers', () => {
  it('наследует photo_* с <g> если у rect нет id', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <g id="photo_slot">
    <rect x="10" y="5" width="30" height="40"/>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.photoRects).toHaveLength(1)
    expect(r.photoRects[0].name).toBe('photo_slot')
    expect(r.photoRects[0].width).toBeGreaterThan(20)
    expect(r.warnings.every((w) => !w.includes('Не найдено'))).toBe(true)
  })

  it('rect с id photo_* приоритетнее имени группы', () => {
    const svg = `
<svg width="80mm" height="80mm" viewBox="0 0 80 80">
  <g id="photo_outer">
    <rect id="photo_inner" x="0" y="0" width="10" height="10"/>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.photoRects.some((p) => p.name === 'photo_inner')).toBe(true)
  })

  it('убирает photo_* из strippedSvg чтобы не было дубля с полями Fabric', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <g id="photo_slot">
    <rect x="10" y="5" width="30" height="40"/>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.removalRanges.length).toBeGreaterThan(0)
    expect(r.strippedSvg.includes('photo_slot')).toBe(false)
    expect(/<svg[\s\S]*<\/svg>/.test(r.strippedSvg.trim())).toBe(true)
  })

  it('вычисляет prepressHints по связке trim/bleed/safe в мм', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <rect id="bleed" x="0" y="0" width="100" height="50"/>
  <rect id="trim" x="10" y="10" width="80" height="30"/>
  <rect id="safe" x="15" y="15" width="70" height="20"/>
  <g id="photo_x"><rect x="1" y="1" width="4" height="4"/></g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.prepressHints).not.toBeNull()
    expect(r.prepressHints!.bleedMm).toBe(10)
    expect(r.prepressHints!.safeZoneMm).toBe(5)
    expect(Object.keys(r.guideRectsMm).sort()).toEqual(['bleed', 'safe', 'trim'])
  })

  it('сохраняет debug-геометрию Corel SVG в svg/mm/scenePx', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 340.157 188.976">
  <rect id="locked_bg" x="0" y="0" width="340.157" height="188.976"/>
  <rect id="photo_1" x="40" y="20" width="80" height="70"/>
  <text id="text_phone" x="180" y="120" font-size="18">+375291668368</text>
  <rect id="trim" x="0" y="0" width="340.157" height="188.976"/>
</svg>`
    const r = parseImportedSvgLayers(svg)
    const photo = r.photoRects[0]
    const text = r.textItems[0]

    expect(r.geometry.pageMm).toEqual({ width: 90, height: 50 })
    expect(r.geometry.scenePx.width).toBeCloseTo(340.157, 1)
    expect(photo.svg.x).toBe(40)
    expect(photo.x).toBeCloseTo(10.583, 2)
    expect(photo.scene.x).toBeCloseTo(40, 1)
    expect(text.scene.x).toBeCloseTo(180, 1)
  })

  it('читает координаты и выравнивание текста из tspan/style Corel SVG', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 340.157 188.976">
  <g id="text_phone">
    <text style="font-size:42px;text-anchor:end"><tspan x="300" y="150">+375291668368</tspan></text>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg, { sceneScale: 3 })
    const text = r.textItems[0]

    expect(text.text).toBe('+375291668368')
    expect(text.textAnchor).toBe('end')
    expect(text.svg.x).toBe(300)
    expect(text.svg.y).toBe(150)
    expect(text.scene.x).toBeCloseTo(900, 1)
    expect(text.scene.fontSize).toBeCloseTo(126, 1)
    expect(r.geometry.sceneScale).toBe(3)
  })

  it('учитывает transform scale в размере SVG текста', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 340.157 188.976">
  <g id="text_name" transform="matrix(2 0 0 2 20 10)">
    <text x="100" y="60" font-size="18">имя</text>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    const text = r.textItems[0]

    expect(text.svg.x).toBe(220)
    expect(text.svg.y).toBe(130)
    expect(text.svg.fontSize).toBe(36)
    expect(text.scene.fontSize).toBeCloseTo(36, 1)
  })

  it('читает Corel font-size из CSS-класса SVG', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 9000 5000">
  <style type="text/css"><![CDATA[
    .fil1 { fill: #111111 }
    .fnt0 { font-weight: normal; font-size: 635px; font-family: Arial; }
  ]]></style>
  <text id="text_phone" class="fil1 fnt0" x="2400" y="4300">+375291668368</text>
</svg>`
    const r = parseImportedSvgLayers(svg, { sceneScale: 3 })
    const text = r.textItems[0]

    expect(text.svg.fontSize).toBe(635)
    expect(text.fontSize).toBeCloseTo(6.35, 2)
    expect(text.scene.fontSize).toBeCloseTo(72, 0)
  })
})
