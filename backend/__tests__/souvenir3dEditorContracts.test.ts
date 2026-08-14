import {
  fabricToUvCoords,
  uvToFabricCoords,
} from '../../frontend/src/features/souvenir3d/uvToFabricCoords'
import {
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
})
