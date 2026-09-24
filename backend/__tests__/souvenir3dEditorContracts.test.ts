import {
  fabricToUvCoords,
  uvToFabricCoords,
} from '../../frontend/src/features/souvenir3d/uvToFabricCoords'
import {
  buildSouvenirDesignState,
  getUsedPrintAreaIds,
  normalizeSouvenirPages,
  resolveSouvenirFabricCoordSpace,
} from '../../frontend/src/features/souvenir3d/souvenirDesignState'
import {
  scaleSouvenirFabricJsonToCssPx,
} from '../../frontend/src/features/souvenir3d/souvenirFabricCoords'
import type { PrintAreaConfig } from '../../frontend/src/features/souvenir3d/types'

const MM_TO_PX = 96 / 25.4

const areas: PrintAreaConfig[] = [
  {
    id: 'front',
    label: 'Грудь',
    widthMm: 300,
    heightMm: 400,
    meshName: 'print_front',
  },
  {
    id: 'back',
    label: 'Спина',
    widthMm: 280,
    heightMm: 380,
    meshName: 'print_back',
  },
]

describe('souvenir 3D editor contracts', () => {
  it('converts UV to Fabric coordinates and back', () => {
    const fabric = uvToFabricCoords({ u: 0.25, v: 0.75 }, 300, 400)
    expect(fabric).toEqual({ x: 75, y: 100 })
    expect(fabricToUvCoords(fabric, 300, 400)).toEqual({ u: 0.25, v: 0.75 })
  })

  it('maps a legacy one-page draft to the first print area', () => {
    const pages = normalizeSouvenirPages([
      { fabricJSON: { objects: [{ type: 'text', text: 'legacy' }] } },
    ], areas)

    expect(pages).toHaveLength(2)
    expect(pages[0].printAreaId).toBe('front')
    expect(pages[0].fabricJSON.objects).toHaveLength(1)
    expect(pages[1].printAreaId).toBe('back')
    expect(pages[1].fabricJSON.objects).toHaveLength(0)
  })

  it('does not count an empty back area as used', () => {
    const pages = normalizeSouvenirPages([
      { printAreaId: 'front', fabricJSON: { objects: [{ type: 'image' }] } },
      { printAreaId: 'back', fabricJSON: { objects: [] } },
    ], areas)

    expect(getUsedPrintAreaIds(pages, areas)).toEqual(['front'])
  })

  it('treats unmarked souvenir drafts as legacy mm-as-px and upscales on normalize', () => {
    expect(resolveSouvenirFabricCoordSpace({ editorKind: 'souvenir_3d' })).toBe('mm_px')
    expect(resolveSouvenirFabricCoordSpace({
      editorKind: 'souvenir_3d',
      fabricCoordSpace: 'css_px',
    })).toBe('css_px')

    const pages = normalizeSouvenirPages([
      {
        printAreaId: 'front',
        fabricJSON: {
          width: 300,
          height: 400,
          objects: [{ type: 'i-text', left: 150, top: 200, fontSize: 28, width: 40 }],
        },
      },
    ], areas, 'mm_px')

    expect(pages[0].fabricJSON.width).toBe(Math.round(300 * MM_TO_PX))
    expect(pages[0].fabricJSON.height).toBe(Math.round(400 * MM_TO_PX))
    const text = (pages[0].fabricJSON.objects as Array<Record<string, number>>)[0]
    expect(text.left).toBeCloseTo(150 * MM_TO_PX, 5)
    expect(text.fontSize).toBeCloseTo(28 * MM_TO_PX, 5)
  })

  it('marks new souvenir designState as css_px', () => {
    const pages = normalizeSouvenirPages([], areas, 'css_px')
    const state = buildSouvenirDesignState({
      templateId: 1,
      pages,
      areas,
      activePrintAreaId: 'front',
    })
    expect(state.fabricCoordSpace).toBe('css_px')
    expect(state.editorKind).toBe('souvenir_3d')
  })

  it('scaleSouvenirFabricJsonToCssPx multiplies geometry by MM_TO_PX', () => {
    const scaled = scaleSouvenirFabricJsonToCssPx(
      {
        objects: [{ type: 'rect', left: 10, top: 20, width: 30, height: 40 }],
      },
      100,
      50,
    )
    expect(scaled.width).toBe(Math.round(100 * MM_TO_PX))
    const rect = (scaled.objects as Array<Record<string, number>>)[0]
    expect(rect.left).toBeCloseTo(10 * MM_TO_PX, 5)
    expect(rect.width).toBeCloseTo(30 * MM_TO_PX, 5)
  })
})
