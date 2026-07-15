import fs from 'fs'
import path from 'path'
import { parseImportedSvgLayers } from '../src/services/designTemplateSvgParse'
import { buildImportedSvgTemplateDocument } from '../src/services/designTemplateSvgImportBuilder'

const ALBUM_DIR = 'c:/Users/User/Downloads/Telegram Desktop/Новая папка/Новая папка'

function pageNum(name: string): number {
  return parseInt(name.match(/-(\d+)\.svg$/i)?.[1] ?? '0', 10)
}

function readAlbumPage(n: number): string {
  const file = fs.readdirSync(ALBUM_DIR).find((entry) => pageNum(entry) === n)
  if (!file) throw new Error(`album page ${n} not found`)
  return fs.readFileSync(path.join(ALBUM_DIR, file), 'utf8')
}

describe('album wedding SVG', () => {
  const albumExists = fs.existsSync(ALBUM_DIR)

  it('находит 5 decor-полей на страницах 3/6/8/9/11', () => {
    if (!albumExists) return
    const pagesWithDecor = [3, 6, 8, 9, 11]
    for (const page of pagesWithDecor) {
      const r = parseImportedSvgLayers(readAlbumPage(page))
      expect(r.interactiveLayers.filter((layer) => layer.kind === 'decor')).toHaveLength(1)
    }
    const withoutDecor = [1, 4, 7, 10]
    for (const page of withoutDecor) {
      const r = parseImportedSvgLayers(readAlbumPage(page))
      expect(r.interactiveLayers.filter((layer) => layer.kind === 'decor')).toHaveLength(0)
    }
  })

  it('decor_4 на стр.9 — половина страницы справа, текст поверх', () => {
    if (!albumExists) return
    const r = parseImportedSvgLayers(readAlbumPage(9))
    const decor = r.interactiveLayers.find((layer) => layer.kind === 'decor')
    expect(decor?.data.name).toBe('decor_4')
    expect(decor?.data.shape).toBe('rect')
    const pageW = r.geometry.scenePx.width
    expect(decor!.data.scene.width / pageW).toBeGreaterThan(0.48)
    expect(decor!.data.scene.width / pageW).toBeLessThan(0.52)
    expect(decor!.data.scene.x / pageW).toBeGreaterThan(0.48)
    expect(r.interactiveLayers.map((layer) => layer.kind)).toEqual(['photo', 'decor', 'photo', 'text', 'text'])
  })

  it('fabric decor_4 не растягивается на всю страницу', () => {
    if (!albumExists) return
    const doc = buildImportedSvgTemplateDocument({
      buffer: Buffer.from(readAlbumPage(9), 'utf8'),
      originalname: 'album-9.svg',
      mimetype: 'image/svg+xml',
    }, 'album', [])
    const objects = doc.pages[0]!.designPage.fabricJSON.objects
    const decor = objects.find((obj) => obj.id === 'decor_4')
    const pageW = doc.pages[0]!.parsed.geometry.scenePx.width
    expect(decor?.type).toBe('rect')
    expect(Number(decor?.width) / pageW).toBeGreaterThan(0.48)
    expect(Number(decor?.width) / pageW).toBeLessThan(0.52)
    expect(objects.map((obj) => String(obj.id))).toEqual([
      'photo_19',
      'decor_4',
      'photo_18',
      'text_Утро',
      'text_Невесты',
    ])
  })
})
