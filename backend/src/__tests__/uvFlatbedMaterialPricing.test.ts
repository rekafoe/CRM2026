import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { LayoutCalculationService } from '../modules/pricing/services/layoutCalculationService';
import { getDb } from '../db';

jest.mock('../db', () => ({
  getDb: jest.fn(),
}));

jest.mock('../modules/pricing/services/uvFlatbedPricingService', () => ({
  UvFlatbedPricingService: {
    calculate: jest.fn(async () => ({
      printPrice: 100,
      pieceAreaM2: 0.004675,
      totalM2: 0.397375,
      minChargeApplied: false,
      layers: [
        {
          layer: 'color',
          label: 'Цвет',
          passes: 1,
          ratePerM2: 50,
          areaM2PerPiece: 0.004675,
          quantity: 85,
          totalCost: 100,
        },
      ],
    })),
  },
}));

describe('UV flatbed material quantity', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const materialId = 42;
  const sheetPrice = 55;

  const templateConfigData = {
    simplified: {
      use_layout: false,
      include_material_cost: true,
      uv_print: {
        mode: 'flatbed_m2',
        layers: ['color'],
        default_passes: { color: 1 },
        dimensions_mode: 'custom_only',
      },
      sizes: [
        {
          id: 'anchor',
          label: '—',
          width_mm: 85,
          height_mm: 55,
          print_prices: [],
          allowed_material_ids: [materialId],
          material_prices: [],
          finishing: [],
        },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string, params?: unknown[]) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            id: 1,
            name: 'УФ ПВХ',
            calculator_type: 'simplified',
            product_type: 'universal',
          };
        }
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) };
        }
        if (query.includes('sheet_width, sheet_height FROM materials')) {
          return { sheet_width: 85, sheet_height: 55 };
        }
        if (query.includes('sheet_price_single FROM materials')) {
          return { sheet_price_single: sheetPrice };
        }
        if (query.includes('FROM materials m') && query.includes('paper_type')) {
          return { name: 'ПВХ 85×55', density: null, paper_type_id: null };
        }
        if (query.includes('FROM price_types')) {
          return null;
        }
        if (query.includes('FROM print_prices') && query.includes('technology_code')) {
          return { id: 9, counter_unit: 'meters', technology_code: 'uv' };
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);
  });

  it('use_layout false: qty 85 → sheetsNeeded 85 and materialPrice 85 × sheet price', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'anchor',
        material_id: materialId,
        print_technology: 'uv',
        trim_size: { width: 85, height: 55 },
        uv_print: { color: { enabled: true, passes: 1 } },
      },
      85,
    );

    expect(result.layout?.itemsPerSheet).toBe(1);
    expect(result.layout?.sheetsNeeded).toBe(85);
    expect(result.materialPrice).toBe(85 * sheetPrice);
    expect(result.materialDetails?.priceForQuantity).toBe(85 * sheetPrice);
    expect(result.finalPrice).toBe(100 + 85 * sheetPrice);
  });

  it('ignores counter_unit=meters for uv flatbed (no roll material qty 4.675)', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'anchor',
        material_id: materialId,
        print_technology: 'uv',
        trim_size: { width: 55, height: 85 },
        uv_print: { color: { enabled: true, passes: 1 } },
      },
      85,
    );

    expect(result.layout?.sheetsNeeded).toBe(85);
    expect(result.layout?.metersNeeded).toBeUndefined();
    expect(result.materialPrice).toBe(85 * sheetPrice);
    expect(result.materialPrice).not.toBeCloseTo(4.675 * sheetPrice, 2);
  });

  it('use_layout true + trim matches material sheet: sheetsNeeded equals quantity', async () => {
    templateConfigData.simplified.use_layout = true;

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'anchor',
        material_id: materialId,
        print_technology: 'uv',
        trim_size: { width: 85, height: 55 },
        uv_print: { color: { enabled: true, passes: 1 } },
      },
      85,
    );

    expect(result.layout?.itemsPerSheet).toBe(1);
    expect(result.layout?.sheetsNeeded).toBe(85);
    expect(result.materialPrice).toBe(85 * sheetPrice);
  });

  it('use_layout true + many items per sheet: adds UV material layout warning', async () => {
    templateConfigData.simplified.use_layout = true;
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return { id: 1, name: 'УФ', calculator_type: 'simplified', product_type: 'universal' };
        }
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) };
        }
        if (query.includes('sheet_width, sheet_height FROM materials')) {
          return { sheet_width: 320, sheet_height: 450 };
        }
        if (query.includes('sheet_price_single FROM materials')) {
          return { sheet_price_single: sheetPrice };
        }
        if (query.includes('FROM materials m') && query.includes('paper_type')) {
          return { name: 'SRA3', density: null, paper_type_id: null };
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'anchor',
        material_id: materialId,
        print_technology: 'uv',
        trim_size: { width: 55, height: 85 },
        uv_print: { color: { enabled: true, passes: 1 } },
      },
      85,
    );

    expect(result.layout!.itemsPerSheet).toBeGreaterThan(1);
    expect(result.layout!.sheetsNeeded).toBeLessThan(85);
    expect(result.warnings?.some((w) => w.includes('раскладке на лист склада'))).toBe(true);
  });
});

describe('UV arbitrary trim on the selected sheet', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const materialId = 42;
  const sheetPrice = 55;

  const config = (extra?: { override?: number; dimensionsMode?: 'custom_only' | 'presets_and_custom' }) => ({
    simplified: {
      use_layout: false,
      include_material_cost: true,
      uv_print: {
        mode: 'flatbed_m2' as const,
        layers: ['color'],
        default_passes: { color: 1 },
        dimensions_mode: extra?.dimensionsMode ?? 'custom_only',
      },
      sizes: [
        {
          id: 'anchor',
          label: '—',
          width_mm: 100,
          height_mm: 100,
          ...(extra?.override != null ? { items_per_sheet_override: extra.override } : {}),
          print_prices: [],
          allowed_material_ids: [materialId],
          material_prices: [],
          finishing: [],
        },
      ],
    },
  });

  const mockDb = (template: unknown, sheet: { width: number; height: number } | null) => {
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) {
          return { id: 1, name: 'УФ', calculator_type: 'simplified', product_type: 'universal' };
        }
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(template) };
        }
        if (query.includes('sheet_width, sheet_height FROM materials')) {
          return sheet ? { sheet_width: sheet.width, sheet_height: sheet.height } : { sheet_width: null, sheet_height: null };
        }
        if (query.includes('sheet_price_single FROM materials')) {
          return { sheet_price_single: sheetPrice };
        }
        if (query.includes('FROM materials m') && query.includes('paper_type')) {
          return { name: 'SRA3', density: null, paper_type_id: null };
        }
        if (query.includes('FROM print_prices') && query.includes('technology_code')) {
          return { id: 9, counter_unit: 'm2', technology_code: 'uv' };
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);
  };

  const calc = (trim: { width: number; height: number }, quantity: number, material = materialId) =>
    SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'anchor',
        ...(material ? { material_id: material } : {}),
        print_technology: 'uv',
        trim_size: trim,
        uv_print: { color: { enabled: true, passes: 1 } },
      },
      quantity,
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('40×30 на SRA3 больше 1 шт/лист, печать остаётся по площади', async () => {
    mockDb(config(), { width: 320, height: 450 });

    const result = await calc({ width: 40, height: 30 }, 4);

    expect(result.layout?.itemsPerSheet).toBeGreaterThan(1);
    expect(result.layout?.sheetsNeeded).toBe(1);
    expect(result.materialPrice).toBe(sheetPrice);
    expect(result.finalPrice).toBe(100 + sheetPrice);
  });

  it('300×400 на SRA3 остаётся 1 шт/лист', async () => {
    mockDb(config(), { width: 320, height: 450 });

    const result = await calc({ width: 300, height: 400 }, 2);

    expect(result.layout?.itemsPerSheet).toBe(1);
    expect(result.layout?.sheetsNeeded).toBe(2);
    expect(result.materialPrice).toBe(2 * sheetPrice);
  });

  it('ручная норма якоря не замораживает произвольный обрез', async () => {
    mockDb(config({ override: 1 }), { width: 320, height: 450 });

    const result = await calc({ width: 40, height: 30 }, 4);

    expect(result.layout?.itemsPerSheet).toBeGreaterThan(1);
  });

  it('пресет при use_layout false остаётся 1 изделием на лист', async () => {
    mockDb(config({ dimensionsMode: 'presets_and_custom' }), { width: 320, height: 450 });

    const preset = await calc({ width: 100, height: 100 }, 3);
    expect(preset.layout?.itemsPerSheet).toBe(1);
    expect(preset.layout?.sheetsNeeded).toBe(3);

    const custom = await calc({ width: 40, height: 30 }, 4);
    expect(custom.layout?.itemsPerSheet).toBeGreaterThan(1);
  });

  it('без листа склада произвольный размер не подменяет SRA3 и не берёт материал', async () => {
    mockDb(config(), null);

    const result = await calc({ width: 40, height: 30 }, 4, 0);

    expect(result.layout?.itemsPerSheet).toBe(1);
    expect(result.layout?.sheetsNeeded).toBe(4);
    expect(result.materialPrice).toBe(0);
    expect(result.finalPrice).toBe(100);
  });
});

describe('LayoutCalculationService trim matches sheet', () => {
  it('85×55 trim on 85×55 sheet → 1 item per sheet', () => {
    const r = LayoutCalculationService.calculateLayout(
      { width: 85, height: 55 },
      { width: 85, height: 55 },
    );
    expect(r.itemsPerSheet).toBe(1);
    expect(r.fitsOnSheet).toBe(true);
  });

  it('trimMatchesSheetSize allows rotation', () => {
    expect(
      LayoutCalculationService.trimMatchesSheetSize(
        { width: 55, height: 85 },
        { width: 85, height: 55 },
      ),
    ).toBe(true);
  });
});
