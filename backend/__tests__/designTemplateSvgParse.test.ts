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
})
