import {
  parsePaintUrlRef,
  parseSvgGradientDefs,
  resolveSvgPaint,
  solidColorFromGradient,
  svgGradientToFabricFill,
} from '../src/services/designTemplateSvgGradients'
import { parseImportedSvgLayers } from '../src/services/designTemplateSvgParse'
import { buildImportedSvgTemplateDocument } from '../src/services/designTemplateSvgImportBuilder'

describe('SVG gradients (Corel)', () => {
  const sampleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <defs>
    <style type="text/css"><![CDATA[
      .fil1 {fill:url(#id0)}
      .fil2 {fill:#EA5949}
    ]]></style>
    <linearGradient id="id0" gradientUnits="userSpaceOnUse" x1="100" y1="50" x2="300" y2="200">
      <stop offset="0" style="stop-opacity:1; stop-color:#FEFEFE"/>
      <stop offset="0.411765" style="stop-opacity:1; stop-color:#F4ACA4"/>
      <stop offset="1" style="stop-opacity:1; stop-color:#EA5949"/>
    </linearGradient>
  </defs>
  <path id="decor_wave" class="fil1" d="M 100 50 L 300 50 L 300 200 L 100 200 Z"/>
  <rect id="decor_box" class="fil2" x="10" y="10" width="20" height="10"/>
</svg>`

  it('parseSvgGradientDefs читает linearGradient и stops', () => {
    const map = parseSvgGradientDefs(sampleSvg)
    expect(map.size).toBe(1)
    const g = map.get('id0')
    expect(g?.kind).toBe('linear')
    expect(g?.units).toBe('userSpaceOnUse')
    expect(g?.stops).toHaveLength(3)
    expect(g?.stops[0]?.color.toUpperCase()).toBe('#FEFEFE')
    expect(g?.stops[2]?.color.toUpperCase()).toBe('#EA5949')
  })

  it('parsePaintUrlRef понимает fill:url(#id)', () => {
    expect(parsePaintUrlRef('url(#id0)')).toBe('id0')
    expect(parsePaintUrlRef("url('#id0')")).toBe('id0')
    expect(parsePaintUrlRef('#fff')).toBeNull()
  })

  it('svgGradientToFabricFill переводит userSpaceOnUse в локальные coords path', () => {
    const map = parseSvgGradientDefs(sampleSvg)
    const def = map.get('id0')!
    const fill = svgGradientToFabricFill(def, { x: 100, y: 50, width: 200, height: 150 }, 'pathLocal')
    expect(fill.type).toBe('linear')
    expect(fill.coords.x1).toBeCloseTo(0, 5)
    expect(fill.coords.y1).toBeCloseTo(0, 5)
    expect(fill.coords.x2).toBeCloseTo(200, 5)
    expect(fill.coords.y2).toBeCloseTo(150, 5)
    expect(fill.colorStops).toHaveLength(3)
  })

  it('resolveSvgPaint резолвит url(#id) в Fabric gradient', () => {
    const map = parseSvgGradientDefs(sampleSvg)
    const paint = resolveSvgPaint(
      'url(#id0)',
      map,
      { x: 100, y: 50, width: 200, height: 150 },
      'pathLocal',
    )
    expect(paint && typeof paint === 'object' && paint.type === 'linear').toBe(true)
  })

  it('solidColorFromGradient берёт средний stop', () => {
    const map = parseSvgGradientDefs(sampleSvg)
    expect(solidColorFromGradient(map.get('id0')!).toUpperCase()).toBe('#F4ACA4')
  })

  it('parseImportedSvgLayers кладёт gradient в decor fill', () => {
    const r = parseImportedSvgLayers(sampleSvg)
    const wave = r.interactiveLayers.find((l) => l.kind === 'decor' && l.data.name === 'decor_wave')
    expect(wave?.kind).toBe('decor')
    if (wave?.kind !== 'decor') return
    const fill = wave.data.fill
    expect(fill && typeof fill === 'object' && (fill as { type: string }).type === 'linear').toBe(true)
    if (fill && typeof fill === 'object') {
      expect(fill.colorStops.length).toBe(3)
    }
  })

  it('buildImportedSvgTemplateDocument сериализует gradient в fabricJSON', () => {
    const doc = buildImportedSvgTemplateDocument({
      buffer: Buffer.from(sampleSvg, 'utf8'),
      originalname: 'grad.svg',
      mimetype: 'image/svg+xml',
    }, 'grad', [])
    const wave = doc.pages[0]!.designPage.fabricJSON.objects.find((o) => o.id === 'decor_wave') as {
      fill?: { type?: string; colorStops?: unknown[] }
    } | undefined
    expect(wave?.fill?.type).toBe('linear')
    expect(wave?.fill?.colorStops?.length).toBe(3)
  })

  it('парсит radialGradient', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <defs>
    <radialGradient id="rg" gradientUnits="objectBoundingBox" cx="0.5" cy="0.5" r="0.5" fx="0.5" fy="0.5">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#000000"/>
    </radialGradient>
  </defs>
  <rect id="decor_orb" x="10" y="10" width="40" height="40" fill="url(#rg)"/>
</svg>`
    const r = parseImportedSvgLayers(svg)
    const orb = r.interactiveLayers.find((l) => l.kind === 'decor' && l.data.name === 'decor_orb')
    expect(orb?.kind).toBe('decor')
    if (orb?.kind !== 'decor') return
    const fill = orb.data.fill
    expect(fill && typeof fill === 'object' && fill.type === 'radial').toBe(true)
  })
})
