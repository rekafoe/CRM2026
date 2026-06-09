import { fabricTextFromSvgText } from '../src/services/designTemplateSvgImportBuilder'
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
})
