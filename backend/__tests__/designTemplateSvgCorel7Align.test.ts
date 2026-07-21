import * as fs from 'fs'
import { parseImportedSvgLayers } from '../src/services/designTemplateSvgParse'
import { buildImportedSvgTemplateDocument } from '../src/services/designTemplateSvgImportBuilder'

const CORE_7_1 = 'C:/Users/User/Desktop/dbpbnrb/7/7/7-1.svg'
const CORE_7_2 = 'C:/Users/User/Desktop/dbpbnrb/7/7/7-2.svg'
const hasDesktopFixtures = fs.existsSync(CORE_7_1) && fs.existsSync(CORE_7_2)

describe('Corel stacked text alignment', () => {
  it('выводит center по разным x у отдельных <text> с одним id', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <text id="text_title" x="194.4" y="200" font-size="48">НАЗВАНИЕ</text>
  <text id="text_title" x="215.3" y="280" font-size="28">ОРГАНИЗАЦИИ</text>
</svg>`
    const text = parseImportedSvgLayers(svg).textItems[0]
    expect(text?.textAnchor).toBe('middle')
    expect(text?.text).toContain('\n')
  })

  it('выводит end по разным x у отдельных <text> с одним id', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="94mm" height="54mm" viewBox="0 0 9400 5400">
  <text id="text_name" x="6840.86" y="782.69" font-size="208.64">ИМЯ ФАМИЛИЯ</text>
  <text id="text_name" x="7145.41" y="1060.18" font-size="208.64">ДОЛЖНОСТЬ</text>
</svg>`
    const text = parseImportedSvgLayers(svg).textItems[0]
    expect(text?.textAnchor).toBe('end')
  })

  ;(hasDesktopFixtures ? it : it.skip)('7-1 desktop: center без text-align', () => {
    const svg = fs.readFileSync(CORE_7_1, 'utf8')
    const text = parseImportedSvgLayers(svg).textItems[0]
    expect(text?.textAnchor).toBe('middle')
    const doc = buildImportedSvgTemplateDocument(
      { buffer: Buffer.from(svg, 'utf8'), originalname: '7-1.svg', mimetype: 'image/svg+xml' },
      '7-1',
      [],
    )
    const textObj = doc.pages[0]!.designPage.fabricJSON.objects.find((o) => {
      const rec = o as { id?: string }
      return typeof rec.id === 'string' && rec.id.startsWith('text_')
    }) as { textAlign?: string; originX?: string } | undefined
    expect(textObj?.textAlign).toBe('center')
    expect(textObj?.originX).toBe('center')
  })

  ;(hasDesktopFixtures ? it : it.skip)('7-2 desktop: правый блок → end', () => {
    const svg = fs.readFileSync(CORE_7_2, 'utf8')
    const nameBlock = parseImportedSvgLayers(svg).textItems.find((t) => /ДОЛЖНОСТЬ|ФАМИЛИЯ|ИМЯ/i.test(t.text))
    expect(nameBlock?.textAnchor).toBe('end')
  })
})
