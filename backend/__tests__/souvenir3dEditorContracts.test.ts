import {
  scaleSouvenirFabricPlacement,
  SOUVENIR_CANVAS_PX_PER_MM,
  souvenirPlacementScaleFactor,
} from '../src/utils/souvenirFabricCoords'
import {
  fabricToUvCoords,
  uvToFabricCoords,
} from '../../frontend/src/features/souvenir3d/uvToFabricCoords'
import {
  buildSouvenirDesignState,
  getUsedPrintAreaIds,
  normalizeSouvenirPages,
} from '../../frontend/src/features/souvenir3d/souvenirDesignState'
import type { PrintAreaConfig } from '../../frontend/src/features/souvenir3d/types'

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

  it('saves souvenir layouts in the same 96 dpi space as production', () => {
    const state = buildSouvenirDesignState({
      templateId: 7,
      pages: normalizeSouvenirPages([], areas),
      areas,
      activePrintAreaId: 'front',
    })

    expect(state.sceneScale).toBe(1)
    expect(state.souvenirPxPerMm).toBeCloseTo(SOUVENIR_CANVAS_PX_PER_MM)
    expect(souvenirPlacementScaleFactor(state)).toBe(1)
    expect(SOUVENIR_CANVAS_PX_PER_MM).toBeCloseTo(96 / 25.4)
  })

  it('lifts a legacy 1px-per-mm souvenir object onto the production canvas', () => {
    const legacy = {
      editorKind: 'souvenir_3d' as const,
      pageWidth: 300,
      pageHeight: 400,
      pages: [{
        widthMm: 300,
        heightMm: 400,
        fabricJSON: {
          objects: [
            { type: 'i-text', left: 150, top: 200, fontSize: 28, width: 80, scaleX: 1, scaleY: 1 },
          ],
        },
      }],
    }
    const factor = souvenirPlacementScaleFactor(legacy)
    expect(factor).toBeCloseTo(SOUVENIR_CANVAS_PX_PER_MM)

    const scaled = scaleSouvenirFabricPlacement({
      objects: [
        { type: 'i-text', left: 150, top: 200, fontSize: 28, width: 80, scaleX: 1, scaleY: 1 },
        {
          type: 'image',
          left: 10,
          top: 20,
          width: 1000,
          height: 800,
          scaleX: 0.2,
          scaleY: 0.2,
        },
        {
          type: 'group',
          left: 4,
          top: 6,
          scaleX: 1,
          scaleY: 1,
          objects: [{ type: 'rect', left: 3, top: 3, scaleX: 1, scaleY: 1, width: 12, height: 12 }],
        },
      ],
    }, factor) as {
      objects: Array<Record<string, any>>
    }

    const text = scaled.objects[0]
    expect(text.left).toBeCloseTo(150 * factor)
    expect(text.top).toBeCloseTo(200 * factor)
    expect(text.fontSize).toBe(28)
    expect(text.width).toBe(80)
    expect(text.scaleX).toBeCloseTo(factor)
    expect(text.left).toBeCloseTo((300 * SOUVENIR_CANVAS_PX_PER_MM) / 2)

    const image = scaled.objects[1]
    expect(image.width).toBe(1000)
    expect(image.scaleX).toBeCloseTo(0.2 * factor)

    const group = scaled.objects[2]
    expect(group.scaleX).toBeCloseTo(factor)
    expect(group.objects[0].left).toBe(3)
    expect(group.objects[0].scaleX).toBe(1)
  })

  it('leaves poligraphy and already converted souvenir states untouched', () => {
    expect(souvenirPlacementScaleFactor({ editorKind: 'flat' })).toBe(1)
    expect(souvenirPlacementScaleFactor({
      editorKind: 'souvenir_3d',
      souvenirPxPerMm: SOUVENIR_CANVAS_PX_PER_MM,
    })).toBe(1)
    expect(souvenirPlacementScaleFactor({
      editorKind: 'souvenir_3d',
      pageWidth: 300,
      pageHeight: 400,
      pages: [{
        widthMm: 300,
        heightMm: 400,
        fabricJSON: {
          objects: [{ type: 'i-text', left: 560, top: 700, width: 200, scaleX: 1, scaleY: 1 }],
        },
      }],
    })).toBe(1)
  })
})
