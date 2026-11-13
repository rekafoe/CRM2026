import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { LayoutCalculationService } from '../modules/pricing/services/layoutCalculationService';
import { getDb } from '../db';
import { BindingPricingService } from '../modules/pricing/services/bindingPricingService';
import { PricingServiceRepository } from '../modules/pricing/repositories/serviceRepository';
import { getTableColumns } from '../utils/tableSchemaCache';

jest.mock('../db', () => ({
  getDb: jest.fn(),
}));

const layoutMock = (itemsPerSheet: number) => ({
  fitsOnSheet: true,
  itemsPerSheet,
  sheetsNeeded: 100,
  wastePercentage: 0,
  recommendedSheetSize: { width: 320, height: 450 },
  layout: { rows: 1, cols: itemsPerSheet, actualItemsPerSheet: itemsPerSheet },
  cutsPerSheet: 0,
});

jest.mock('../modules/pricing/services/layoutCalculationService', () => ({
  LayoutCalculationService: {
    calculateLayout: jest.fn(() => layoutMock(1)),
    findOptimalSheetSize: jest.fn(() => layoutMock(1)),
  },
}));

jest.mock('../utils/tableSchemaCache', () => ({
  getTableColumns: jest.fn(async () => new Set<string>()),
  hasColumn: jest.fn(async () => false),
  invalidateTableSchemaCache: jest.fn(),
}));

jest.mock('../modules/pricing/repositories/serviceRepository', () => ({
  PricingServiceRepository: {
    listServiceTiers: jest.fn(async () => []),
    getServiceById: jest.fn(async () => null),
  },
}));

jest.mock('../modules/pricing/services/bindingPricingService', () => {
  const actual = jest.requireActual('../modules/pricing/services/bindingPricingService');
  return {
    ...actual,
    BindingPricingService: {
      quoteBinding: jest.fn(),
    },
  };
});

describe('SimplifiedPricingService multi_page cover/innerBlock', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>;
  const mockedQuoteBinding = BindingPricingService.quoteBinding as jest.MockedFunction<typeof BindingPricingService.quoteBinding>;

  let productRow: any;
  let templateConfigData: any;

  beforeEach(() => {
    jest.clearAllMocks();
    (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layoutMock(1));
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layoutMock(1));

    productRow = {
      id: 1,
      name: 'Тестовая брошюра',
      calculator_type: 'simplified',
      product_type: 'multi_page',
    };

    templateConfigData = {
      simplified: {
        include_material_cost: false,
        sizes: [
          {
            id: 'a4',
            label: 'A4',
            width_mm: 210,
            height_mm: 297,
            print_prices: [
              {
                technology_code: 'laser_prof',
                color_mode: 'color',
                sides_mode: 'single',
                tiers: [{ min_qty: 1, unit_price: 2 }],
              },
            ],
            material_prices: [],
            finishing: [],
          },
        ],
      },
    };

    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string, params?: unknown[]) => {
        if (query.includes('FROM products WHERE id = ?')) return productRow;
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) };
        }
        if (query.includes('FROM post_processing_services') && query.includes('operation_type')) {
          const id = Number(params?.[0]);
          if (id === 77) return { id: 77, operation_type: 'bind' };
          return { id, operation_type: 'laminate' };
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);

    mockedQuoteBinding.mockResolvedValue({
      serviceId: 77,
      serviceName: 'Пружина',
      priceUnit: 'per_item',
      unitPrice: 0.5,
      units: 100,
      total: 50,
    });
  });

  it('сохраняет legacy-расчет, если multiPageStructure отсутствует', async () => {
    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 16 as any,
      } as any,
      100
    );

    expect(result.breakdown).toBeUndefined();
    // 16 стр. × 100 шт. × 2 BYN/лист
    expect(result.finalPrice).toBe(3200);
    expect(mockedQuoteBinding).not.toHaveBeenCalled();
  });

  it('считает cover + binding при наличии multiPageStructure', async () => {
    templateConfigData.simplified.multiPageStructure = {
      cover: {
        mode: 'self',
        qty_per_item: 1,
        print: {
          sides_mode: 'single',
        },
      },
      innerBlock: {
        pagesSource: 'parameter',
      },
      binding: {
        service_id: 77,
        units_per_item: 1,
      },
    };

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 16 as any,
      } as any,
      100
    );

    expect(mockedQuoteBinding).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 77, quantity: 100, unitsPerItem: 1 })
    );
    expect(result.breakdown).toBeDefined();
    expect(result.breakdown?.innerBlockPrice).toBe(3200);
    expect(result.breakdown?.coverPrice).toBe(0);
    expect(result.breakdown?.bindingPrice).toBe(50);
    expect(result.finalPrice).toBe(3250);
    const bindRow = result.finishingDetails?.find((d) => d.service_id === 77);
    expect(bindRow).toBeDefined();
    expect(bindRow?.operation_type).toBe('bind');
    expect(bindRow?.priceForQuantity).toBe(50);
  });

  it('использует fixedPages из innerBlock при pagesSource=fixed', async () => {
    templateConfigData.simplified.pages = { options: [4, 8, 12, 16, 20, 24], default: 24 };
    templateConfigData.simplified.multiPageStructure = {
      innerBlock: {
        pagesSource: 'fixed',
        fixedPages: 8,
      },
    };

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 24 as any,
      } as any,
      10,
    );

    // 8 стр. × 10 шт. × 2 BYN/лист = 160 (не 24×10×2)
    expect(result.finalPrice).toBe(160);
  });

  it('принимает pages вне списка options для multi_page (в пределах max)', async () => {
    templateConfigData.simplified.pages = { options: [4, 8, 12, 16, 20, 24], default: 24 };
    delete templateConfigData.simplified.multiPageStructure;

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 10 as any,
      } as any,
      10,
    );

    expect(result.finalPrice).toBeGreaterThan(0);
  });

  it('считает по страницам при simplified.pages, даже если product_type не multi_page', async () => {
    productRow.product_type = 'flyers';
    templateConfigData.simplified.pages = { min: 4, max: 28, default: 4 };
    templateConfigData.simplified.sizes[0].min_qty = 2;
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValueOnce(layoutMock(2));

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 4 as any,
      } as any,
      1,
    );

    // 2 листа × 2 поля × 2 BYN
    expect(result.finalPrice).toBe(8);
  });

  it('28 стр. duplex на SRA3 (2 A4 на сторону) → 7 печатных листов на изделие', async () => {
    (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layoutMock(2));
    (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layoutMock(2));
    templateConfigData.simplified.sizes[0].print_prices.push({
      technology_code: 'laser_prof',
      color_mode: 'color',
      sides_mode: 'duplex',
      tiers: [{ min_qty: 1, unit_price: 2 }],
    });

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'duplex',
        pages: 28 as any,
      } as any,
      1,
    );

    // 7 листов × 2 поля A4 × 2 BYN/поле = 28
    expect(result.finalPrice).toBe(28);
    expect(result.layout?.sheetsNeeded).toBe(7);
  });

  it('не привязывает мин. тираж к раскладке (itemsPerSheet) для multi_page', async () => {
    const layout = LayoutCalculationService as jest.Mocked<typeof LayoutCalculationService>;
    (layout.calculateLayout as jest.Mock).mockReturnValueOnce(layoutMock(2));
    (layout.findOptimalSheetSize as jest.Mock).mockReturnValueOnce(layoutMock(2));
    templateConfigData.simplified.sizes[0].items_per_sheet_override = 2;
    templateConfigData.simplified.sizes[0].min_qty = 2;

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 4 as any,
      } as any,
      1,
    );

    // 2 листа × 2 поля × 2 BYN
    expect(result.finalPrice).toBe(8);
  });

  it('tier печати обложки: суммарный объём блок+обложка (не только листы обложки)', async () => {
    templateConfigData.simplified.sizes[0].print_prices[0].tiers = [
      { min_qty: 1, unit_price: 2 },
      { min_qty: 100, unit_price: 1 },
    ];
    templateConfigData.simplified.multiPageStructure = {
      innerBlock: { pagesSource: 'parameter' },
      cover: {
        mode: 'separate',
        page_count: 4,
        material_id: 99,
        print: { sides_mode: 'single' },
      },
    };

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 10 as any,
      } as any,
      10,
    );

    // 10 стр. всего − 4 обл. = 6 блок → 6 листов × 10 = 60 units; обложка 4×10 = 40; tier по 100 → 1 BYN/ед.
    expect(result.breakdown?.innerBlockPrice).toBe(60);
    expect(result.breakdown?.coverPrice).toBe(40);
    expect(result.finalPrice).toBe(100);
  });

  it('использует max страниц из typeConfigs при type_id', async () => {
    templateConfigData.simplified.pages = {
      options: [4, 8, 12, 16, 20, 24, 28],
      default: 28,
    };
    templateConfigData.simplified.types = [{ id: 1, name: 'Основной', default: true }];
    templateConfigData.simplified.typeConfigs = {
      '1': {
        sizes: templateConfigData.simplified.sizes,
        pages: { options: [4, 8, 12, 16, 20, 24, 28], default: 28, min: 4, max: 130, step: 4 },
      },
    };

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        type_id: 1,
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 40 as any,
      } as any,
      1,
    );

    expect(result.finalPrice).toBe(80);
  });

  it('отклоняет pages выше max шаблона для multi_page', async () => {
    templateConfigData.simplified.pages = { options: [24], max: 100 };
    delete templateConfigData.simplified.multiPageStructure;

    await expect(
      SimplifiedPricingService.calculatePrice(
        1,
        {
          size_id: 'a4',
          print_technology: 'laser_prof',
          print_color_mode: 'color',
          print_sides_mode: 'single',
          pages: 150 as any,
        } as any,
        10,
      ),
    ).rejects.toThrow(/Не более/);
  });

  it('кладёт переплёт поверх ненулевой отделки', async () => {
    templateConfigData.simplified.sizes[0].finishing = [{ service_id: 55 }];
    templateConfigData.simplified.multiPageStructure = {
      innerBlock: { pagesSource: 'parameter' },
      binding: { service_id: 77, units_per_item: 1 },
    };
    (PricingServiceRepository.listServiceTiers as jest.Mock).mockImplementation(async (serviceId: number) => {
      if (serviceId === 55) {
        return [{ id: 1, serviceId: 55, minQuantity: 1, rate: 1, isActive: true }];
      }
      return [];
    });
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string, params?: unknown[]) => {
        if (query.includes('FROM products WHERE id = ?')) return productRow;
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) };
        }
        if (query.includes('FROM post_processing_services') && query.includes('operation_type')) {
          const id = Number(params?.[0]);
          if (id === 77) return { id: 77, operation_type: 'bind', is_active: 1 };
          return { id, operation_type: 'laminate', is_active: 1 };
        }
        return null;
      }),
      all: jest.fn(async (query: string) => {
        if (String(query).includes('FROM post_processing_services') && String(query).includes('id IN')) {
          return [{
            id: 55,
            name: 'Ламинация',
            operation_type: 'laminate',
            price_unit: 'per_item',
            min_quantity: 1,
            max_quantity: null,
          }];
        }
        return [];
      }),
      run: jest.fn(),
    } as any);

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 4 as any,
      } as any,
      100,
    );

    expect(result.finalPrice).toBe(950);
    expect(result.breakdown?.otherFinishingPrice).toBe(100);
    expect(result.breakdown?.bindingPrice).toBe(50);
    expect(result.selectedFinishing?.filter((row) => row.service_id === 77)).toHaveLength(1);
  });

  it('не возвращает цену, если цитата переплёта упала', async () => {
    templateConfigData.simplified.multiPageStructure = {
      innerBlock: { pagesSource: 'parameter' },
      binding: { service_id: 77, units_per_item: 1 },
    };
    mockedQuoteBinding.mockRejectedValue(Object.assign(new Error('не лист'), { status: 400 }));

    await expect(
      SimplifiedPricingService.calculatePrice(
        1,
        {
          size_id: 'a4',
          print_technology: 'laser_prof',
          print_color_mode: 'color',
          print_sides_mode: 'single',
          pages: 8 as any,
        } as any,
        10,
      ),
    ).rejects.toThrow(/не лист/);
  });

  it('не подставляет ноль в таблицу тиражей, если цитата диапазона упала', async () => {
    templateConfigData.simplified.multiPageStructure = {
      innerBlock: { pagesSource: 'parameter' },
      binding: { service_id: 77, units_per_item: 1 },
    };
    mockedQuoteBinding
      .mockResolvedValueOnce({
        serviceId: 77,
        serviceName: 'Пружина',
        priceUnit: 'per_item',
        unitPrice: 0.5,
        units: 10,
        total: 5,
      })
      .mockRejectedValueOnce(Object.assign(new Error('диапазон'), { status: 400 }));

    await expect(
      SimplifiedPricingService.calculatePrice(
        1,
        {
          size_id: 'a4',
          print_technology: 'laser_prof',
          print_color_mode: 'color',
          print_sides_mode: 'single',
          pages: 8 as any,
        } as any,
        10,
      ),
    ).rejects.toThrow(/диапазон/);
  });

  it('отвечает ошибкой, если переплёт шаблона выключен', async () => {
    templateConfigData.simplified.multiPageStructure = {
      innerBlock: { pagesSource: 'parameter' },
      binding: { service_id: 77, units_per_item: 1 },
    };
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string, params?: unknown[]) => {
        if (query.includes('FROM products WHERE id = ?')) return productRow;
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) };
        }
        if (query.includes('FROM post_processing_services') && query.includes('operation_type')) {
          return { id: Number(params?.[0]), operation_type: 'bind', is_active: 0 };
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);

    await expect(
      SimplifiedPricingService.calculatePrice(
        1,
        {
          size_id: 'a4',
          print_technology: 'laser_prof',
          print_color_mode: 'color',
          print_sides_mode: 'single',
          pages: 8 as any,
        } as any,
        10,
      ),
    ).rejects.toThrow(/выключен/);
    expect(mockedQuoteBinding).not.toHaveBeenCalled();
  });

  it('списывает материал переплёта по норме и единицам цитаты, без подачи рулона', async () => {
    templateConfigData.simplified.multiPageStructure = {
      innerBlock: { pagesSource: 'parameter' },
      binding: { service_id: 77, units_per_item: 1 },
    };
    mockedQuoteBinding.mockResolvedValue({
      serviceId: 77,
      serviceName: 'Пружина',
      variantId: 5,
      priceUnit: 'per_item',
      unitPrice: 0.5,
      units: 100,
      total: 50,
    });
    (getTableColumns as jest.Mock).mockImplementation(async (table: string) => {
      if (table === 'service_variants' || table === 'post_processing_services') {
        return new Set(['material_id', 'qty_per_item', 'consumption_mode', 'meter_basis']);
      }
      return new Set();
    });
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string, params?: unknown[]) => {
        if (query.includes('FROM products WHERE id = ?')) return productRow;
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) };
        }
        if (query.includes('FROM post_processing_services') && query.includes('operation_type')) {
          return { id: Number(params?.[0]), operation_type: 'bind', is_active: 1 };
        }
        return null;
      }),
      all: jest.fn(async (query: string) => {
        const sql = String(query);
        if (sql.includes('FROM service_variants') && sql.includes('material_id')) {
          return [{ id: 5, material_id: 9, qty_per_item: 2, consumption_mode: 'roll_feed', meter_basis: 'feed' }];
        }
        if (sql.includes('FROM materials')) {
          return [{ id: 9, name: 'Пружина', sheet_width: 320, printable_width: null }];
        }
        return [];
      }),
      run: jest.fn(),
    } as any);

    const result = await SimplifiedPricingService.calculatePrice(
      1,
      {
        size_id: 'a4',
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        pages: 4 as any,
      } as any,
      100,
    );

    expect(result.operationMaterials).toEqual([
      { material_id: 9, material_name: 'Пружина', quantity: 200 },
    ]);
  });
});

