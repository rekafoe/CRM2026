import { getDb } from '../db'
import { MaterialPrintResolver } from '../modules/pricing/services/materialPrintResolver'
import { MaterialPrintTechnologyService } from '../modules/warehouse/services/materialPrintTechnologyService'

jest.mock('../db', () => ({
  getDb: jest.fn(),
}))

describe('MaterialPrintResolver', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('chooses technology from material type and the fitting roll with least waste', async () => {
    jest.spyOn(MaterialPrintTechnologyService, 'listForMaterialType').mockResolvedValue([
      {
        id: 1,
        material_type_id: 7,
        technology_code: 'inkjet_solvent',
        technology_name: 'Сольвентная',
        pricing_mode: 'per_meter',
        supports_indoor: 1,
        supports_outdoor: 1,
        is_default: 1,
        priority: 10,
        is_active: 1,
      },
    ])

    const requested = {
      id: 102,
      name: 'Oracal матовая 1050',
      material_type_id: 7,
      material_kind: 'roll',
      sheet_width: 1050,
      sheet_height: null,
      printable_width: 1030,
      quantity: 100,
      reserved_quantity: 0,
    }
    const narrow = {
      ...requested,
      id: 101,
      name: 'Oracal матовая 630',
      sheet_width: 630,
      printable_width: 620,
    }

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM materials m') && query.includes('WHERE m.id = ?')) return requested
        if (query.includes('FROM print_prices')) {
          return { counter_unit: 'meters', m2_pricing_kind: null }
        }
        return null
      }),
      all: jest.fn(async (query: string) => {
        if (query.includes("m.material_kind = 'roll'")) return [requested, narrow]
        return []
      }),
      run: jest.fn(),
    } as any)

    const result = await MaterialPrintResolver.resolve({
      requestedMaterialId: requested.id,
      allowedMaterialIds: [requested.id, narrow.id],
      usageContext: 'outdoor',
      trimMm: { width: 600, height: 100 },
      quantity: 1,
      configuredTechnologyCodes: ['inkjet_solvent'],
    })

    expect(result.technologyCode).toBe('inkjet_solvent')
    expect(result.selectedMaterialId).toBe(narrow.id)
    expect(result.selectedMaterialWidthMm).toBe(630)
    expect(result.usageContext).toBe('outdoor')
  })

  it('rejects a material that is not allowed for the selected size', async () => {
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async () => ({
        id: 102,
        name: 'Чужой материал',
        material_type_id: 7,
        material_kind: 'roll',
        sheet_width: 630,
        quantity: 100,
        reserved_quantity: 0,
      })),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any)

    await expect(
      MaterialPrintResolver.resolve({
        requestedMaterialId: 102,
        allowedMaterialIds: [101],
        usageContext: 'indoor',
        trimMm: { width: 100, height: 100 },
        quantity: 1,
      }),
    ).rejects.toThrow(/не разрешён/)
  })
})
