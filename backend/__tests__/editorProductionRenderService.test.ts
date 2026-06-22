import fs from 'fs'
import path from 'path'
import { __editorProductionRenderInternals } from '../src/services/editorProductionRenderService'
import { orderFilesDir } from '../src/config/upload'

describe('editorProductionRenderService internals', () => {
  const transparentPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
  const mmToPxAt300 = (mm: number) => Math.round((mm * 300) / 25.4)
  const readPngSize = (png: Buffer) => ({
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  })

  afterAll(async () => {
    await __editorProductionRenderInternals.closeProductionRenderBrowser()
  }, 30000)

  it('renders filled photo field group as clipped container instead of flattening children', () => {
    const fabricJSON = {
      objects: [
        {
          type: 'group',
          left: 20,
          top: 30,
          width: 200,
          height: 120,
          isPhotoField: true,
          photoFieldFilled: true,
          photoFieldFw: 200,
          photoFieldFh: 120,
          clipPath: { type: 'rect', left: -100, top: -60, width: 200, height: 120 },
          objects: [
            { type: 'rect', left: -100, top: -60, width: 200, height: 120 },
            {
              type: 'image',
              left: 0,
              top: 0,
              originX: 'center',
              originY: 'center',
              width: 300,
              height: 180,
              scaleX: 1,
              scaleY: 1,
              src: transparentPng,
            },
          ],
        },
      ],
    }

    const { html } = __editorProductionRenderInternals.buildPageHtml(
      fabricJSON,
      new Map(),
      90,
      50,
      0,
    )
    const diagnostics = __editorProductionRenderInternals.collectProductionPageDiagnostics(fabricJSON, new Map())

    expect(diagnostics.filledPhotoFields).toBe(1)
    expect(diagnostics.clipPaths).toBe(1)
    expect(diagnostics.unresolvedImages).toEqual([])
    expect(html).toContain('overflow:hidden')
    expect(html).toContain(`src="${transparentPng}"`)
    expect(html).toContain('width:200px')
    expect(html).toContain('height:120px')
  })

  it('resolves /api/uploads image URLs from the uploads folder pattern', () => {
    const diagnostics = __editorProductionRenderInternals.collectProductionPageDiagnostics({
      objects: [{ type: 'image', src: 'data:image/png;base64,abc' }],
    }, new Map())

    expect(diagnostics.images).toBe(1)
    expect(diagnostics.unresolvedImages).toEqual([])
  })

  it('resolves website editor draft file URLs for production PDF renders', () => {
    const filename = `draft-resolve-test-${Date.now()}.png`
    const filePath = path.join(orderFilesDir, filename)
    fs.writeFileSync(filePath, Buffer.from('test'))
    try {
      const map = new Map<string, string>()
      __editorProductionRenderInternals.addEditorDraftFileUrlAliases(
        map,
        '7mRT6Md0k5QeNfM79pLNeVTs',
        94,
        filename,
      )
      const src = 'https://printcore.by/api/editor/drafts/7mRT6Md0k5QeNfM79pLNeVTs/files/94/content'

      expect(__editorProductionRenderInternals.resolveImageSrc(src, map)).toMatch(/^file:\/\//)
      expect(__editorProductionRenderInternals.collectProductionPageDiagnostics({
        objects: [{ type: 'image', src }],
      }, map).unresolvedImages).toEqual([])
    } finally {
      fs.rmSync(filePath, { force: true })
    }
  })

  it('fails loudly for single-color production renders', () => {
    expect(() => __editorProductionRenderInternals.assertHealthyPixelStats({
      width: 100,
      height: 100,
      sampledPixels: 100,
      nonWhiteRatio: 0.5,
      nonBlackRatio: 1,
      uniqueColorSamples: 1,
    }, 'Page 1')).toThrow(/single-color/)
  })

  it('fails loudly for almost fully white or black production renders', () => {
    expect(() => __editorProductionRenderInternals.assertHealthyPixelStats({
      width: 100,
      height: 100,
      sampledPixels: 100,
      nonWhiteRatio: 0,
      nonBlackRatio: 1,
      uniqueColorSamples: 2,
    }, 'Page 1')).toThrow(/almost fully white/)

    expect(() => __editorProductionRenderInternals.assertHealthyPixelStats({
      width: 100,
      height: 100,
      sampledPixels: 100,
      nonWhiteRatio: 1,
      nonBlackRatio: 0,
      uniqueColorSamples: 2,
    }, 'Page 2')).toThrow(/almost fully black/)
  })

  it('builds a full-page raster wrapper for PNG production pages', () => {
    const html = __editorProductionRenderInternals.buildRasterPageHtml(Buffer.from('abc'), 92, 54)

    expect(html).toContain('width:92mm')
    expect(html).toContain('height:54mm')
    expect(html).toContain('data:image/png;base64,YWJj')
  })

  it('renders a Fabric page through the headless browser bridge', async () => {
    const rendered = await __editorProductionRenderInternals.renderFabricPageToPng({
      version: '7.4.0',
      objects: [
        { type: 'rect', left: 6, top: 6, width: 40, height: 24, fill: '#c01818' },
        { type: 'text', left: 8, top: 34, text: 'PDF', fontSize: 14, fill: '#111111' },
      ],
    }, new Map(), 30, 20, 2, '', 0)

    expect(rendered.png.length).toBeGreaterThan(100)
    expect(rendered.widthMm).toBe(34)
    expect(rendered.heightMm).toBe(24)
    expect(rendered.pixelStats.uniqueColorSamples).toBeGreaterThan(1)
  }, 30000)

  it('keeps physical sheet pixel size with sceneScale=3', async () => {
    const rendered = await __editorProductionRenderInternals.renderFabricPageToPng({
      version: '7.4.0',
      objects: [
        { type: 'rect', left: 240, top: 140, width: 80, height: 50, fill: '#1d4ed8' },
      ],
    }, new Map(), 30, 20, 2, '', 0, 3)

    const pngSize = readPngSize(rendered.png)
    expect(rendered.widthMm).toBe(34)
    expect(rendered.heightMm).toBe(24)
    expect(pngSize.width).toBe(mmToPxAt300(34))
    expect(pngSize.height).toBe(mmToPxAt300(24))
    expect(rendered.pixelStats.nonWhiteRatio).toBeGreaterThan(0.001)
  }, 30000)

  it('does not mark pages with small visible content as single-color', async () => {
    const rendered = await __editorProductionRenderInternals.renderFabricPageToPng({
      version: '7.4.0',
      objects: [
        { type: 'text', left: 12, top: 12, text: 'small', fontSize: 6, fill: '#111111' },
      ],
    }, new Map(), 90, 50, 0, '', 0)

    expect(rendered.pixelStats.uniqueColorSamples).toBeGreaterThan(1)
    expect(rendered.pixelStats.nonWhiteRatio).toBeGreaterThan(0)
  }, 30000)
})
