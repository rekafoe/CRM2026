import {
  allocateEditableFabricId,
  createEditableIdAllocator,
  parseImportedSvgLayers,
  splitTextLayerAlignHint,
} from '../src/services/designTemplateSvgParse'
import { buildImportedSvgTemplateDocument } from '../src/services/designTemplateSvgImportBuilder'

describe('splitTextLayerAlignHint', () => {
  it('читаёт суффикс и оставляет base для id', () => {
    expect(splitTextLayerAlignHint('text_title_center')).toEqual({
      baseName: 'text_title',
      anchor: 'middle',
    })
    expect(splitTextLayerAlignHint('text_name_right')).toEqual({
      baseName: 'text_name',
      anchor: 'end',
    })
    expect(splitTextLayerAlignHint('text_center')).toEqual({
      baseName: 'text_',
      anchor: 'middle',
    })
    expect(splitTextLayerAlignHint('text_title')).toEqual({
      baseName: 'text_title',
    })
  })

  it('allocateEditableFabricId даёт text_1 для text_center', () => {
    const alloc = createEditableIdAllocator()
    const { baseName } = splitTextLayerAlignHint('text_center')
    const { fabricId } = allocateEditableFabricId('text', baseName, alloc)
    expect(fabricId).toBe('text_1')
  })
})

describe('text_*_center → Fabric textAlign', () => {
  it('проставляет textAlign=center при суффиксе _center', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <text id="text_title_center" x="200" y="120" font-size="36">НАЗВАНИЕ</text>
</svg>`
    const text = parseImportedSvgLayers(svg).textItems[0]
    expect(text?.textAnchor).toBe('middle')
    expect(text?.name).toBe('text_title')

    const doc = buildImportedSvgTemplateDocument(
      { buffer: Buffer.from(svg, 'utf8'), originalname: 't.svg', mimetype: 'image/svg+xml' },
      't',
      [],
    )
    const obj = doc.pages[0]!.designPage.fabricJSON.objects.find((o) => (o as { id?: string }).id === 'text_title') as {
      textAlign?: string
      originX?: string
      id?: string
    } | undefined
    expect(obj?.id).toBe('text_title')
    expect(obj?.textAlign).toBe('center')
    expect(obj?.originX).toBe('center')
  })
})
