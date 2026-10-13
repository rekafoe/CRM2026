import { getDb } from '../db'
import {
  MaterialPrintResolver,
  pickMaterialDrivenPrintRow,
} from '../modules/pricing/services/materialPrintResolver'
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
          return {
            counter_unit: 'meters',
            m2_pricing_kind: null,
            price_color_per_meter: 2.5,
            price_bw_per_meter: 1.5,
            price_color_per_m2: null,
          }
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

  it('uses the technology that has a rate when another linked technology does not', async () => {
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
      {
        id: 2,
        material_type_id: 7,
        technology_code: 'laser',
        technology_name: 'Лазерная',
        pricing_mode: 'per_sheet',
        supports_indoor: 1,
        supports_outdoor: 0,
        is_default: 0,
        priority: 20,
        is_active: 1,
      },
    ])

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM materials m')) {
          return {
            id: 20,
            name: 'Мелованная',
            material_type_id: 7,
            material_kind: 'sheet',
            sheet_width: 320,
            sheet_height: 450,
            printable_width: null,
            quantity: 100,
            reserved_quantity: 0,
          }
        }
        if (query.includes('FROM print_prices')) return null
        return null
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any)

    const result = await MaterialPrintResolver.resolve({
      requestedMaterialId: 20,
      allowedMaterialIds: [20],
      usageContext: 'indoor',
      trimMm: { width: 90, height: 50 },
      quantity: 10,
      configuredTechnologyCodes: ['laser'],
    })

    expect(result.technologyCode).toBe('laser')
    expect(result.pricingMode).toBe('per_sheet')
  })

  it('reads m2 kind from the square-meter row, not from a newer sheets row', async () => {
    jest.spyOn(MaterialPrintTechnologyService, 'listForMaterialType').mockResolvedValue([
      {
        id: 3,
        material_type_id: 7,
        technology_code: 'uv',
        technology_name: 'УФ',
        pricing_mode: 'per_m2',
        supports_indoor: 1,
        supports_outdoor: 1,
        is_default: 1,
        priority: 10,
        is_active: 1,
      },
    ])

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string, params?: unknown[]) => {
        if (query.includes('FROM materials m')) {
          return {
            id: 30,
            name: 'ПВХ',
            material_type_id: 7,
            material_kind: 'sheet',
            sheet_width: 1000,
            sheet_height: 1000,
            printable_width: null,
            quantity: 10,
            reserved_quantity: 0,
          }
        }
        if (query.includes('FROM print_prices')) {
          expect(params?.[1]).toBe('m2')
          return {
            counter_unit: 'm2',
            m2_pricing_kind: 'uv_flatbed',
            price_color_per_m2: 0,
            price_color_per_meter: null,
            price_bw_per_meter: null,
          }
        }
        return null
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any)

    const result = await MaterialPrintResolver.resolve({
      requestedMaterialId: 30,
      allowedMaterialIds: [30],
      usageContext: 'indoor',
      trimMm: { width: 200, height: 200 },
      quantity: 1,
    })

    expect(result.technologyCode).toBe('uv')
    expect(result.m2PricingKind).toBe('uv_flatbed')
  })
})

describe('pickMaterialDrivenPrintRow', () => {
  const row = (
    color: 'color' | 'bw',
    sides: 'single' | 'duplex',
    unitPrice: number,
  ) => ({
    color_mode: color,
    sides_mode: sides,
    tiers: [{ min_qty: 1, unit_price: unitPrice }],
  })

  it('skips a zero placeholder and uses the priced variation of the resolved technology', () => {
    const chosen = pickMaterialDrivenPrintRow(
      [row('color', 'single', 0), row('color', 'duplex', 4.5)],
      'color',
      'single',
    )
    expect(chosen?.sides_mode).toBe('duplex')
    expect(chosen?.tiers[0].unit_price).toBe(4.5)
  })
})
