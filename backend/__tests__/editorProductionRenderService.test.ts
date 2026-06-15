import { __editorProductionRenderInternals } from '../src/services/editorProductionRenderService'

describe('editorProductionRenderService internals', () => {
  const transparentPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

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
})
