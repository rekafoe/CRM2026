import {
  inferSceneScaleFromPageExtents,
  resolveProductionSceneScale,
} from '../src/utils/productionSceneScale'

const MM_TO_PX = 96 / 25.4

describe('productionSceneScale', () => {
  it('infers scale 1 when objects sit in base mm*96dpi space', () => {
    const pageWidth = 200
    const pageHeight = 90
    const baseW = pageWidth * MM_TO_PX
    const baseH = pageHeight * MM_TO_PX
    const inferred = inferSceneScaleFromPageExtents({
      pageWidth,
      pageHeight,
      pages: [
        {
          fabricJSON: {
            objects: [
              { type: 'textbox', left: baseW * 0.4, top: baseH * 0.4, width: 40, height: 20 },
              { type: 'rect', left: 0, top: 0, width: baseW * 0.95, height: baseH * 0.95 },
            ],
          },
        },
      ],
    })
    expect(inferred).toBe(1)
  })

  it('infers scale 3 when extents match 3× page', () => {
    const pageWidth = 200
    const pageHeight = 90
    const w = pageWidth * MM_TO_PX * 3
    const h = pageHeight * MM_TO_PX * 3
    const inferred = inferSceneScaleFromPageExtents({
      pageWidth,
      pageHeight,
      sceneScale: 3,
      pages: [
        {
          fabricJSON: {
            objects: [{ type: 'rect', left: 0, top: 0, width: w * 0.95, height: h * 0.95 }],
          },
        },
      ],
    })
    expect(inferred).toBe(3)
  })

  it('prefers inferred over mismatched explicit (up-left bug)', () => {
    const pageWidth = 200
    const pageHeight = 90
    const baseW = pageWidth * MM_TO_PX
    const baseH = pageHeight * MM_TO_PX
    const { scale, diagnostics } = resolveProductionSceneScale({
      pageWidth,
      pageHeight,
      sceneScale: 3,
      pages: [
        {
          fabricJSON: {
            objects: [
              {
                type: 'textbox',
                id: 'text_client',
                left: baseW / 2,
                top: baseH / 2,
                width: 80,
                originX: 'center',
                textAlign: 'center',
                text: 'Hi',
              },
              { type: 'rect', left: 0, top: 0, width: baseW * 0.95, height: baseH * 0.95 },
            ],
          },
        },
      ],
    })
    expect(diagnostics.mismatched).toBe(true)
    expect(diagnostics.explicit).toBe(3)
    expect(diagnostics.inferred).toBe(1)
    expect(scale).toBe(1)
  })

  it('keeps explicit when it matches extents', () => {
    const pageWidth = 90
    const pageHeight = 50
    const w = pageWidth * MM_TO_PX * 3
    const h = pageHeight * MM_TO_PX * 3
    const { scale, diagnostics } = resolveProductionSceneScale({
      pageWidth,
      pageHeight,
      sceneScale: 3,
      pages: [
        {
          fabricJSON: {
            objects: [{ type: 'rect', left: 0, top: 0, width: w * 0.9, height: h * 0.9 }],
          },
        },
      ],
    })
    expect(diagnostics.mismatched).toBe(false)
    expect(scale).toBe(3)
  })
})
