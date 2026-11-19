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

  it('не обнуляет второй distinct bind в finishing при configured multipage binding', async () => {
    // CRM/website: multipageStructure.binding=77 (пружина) + finishing bind 88 (термоклей).
    // Раньше bindAlreadyInFinishing вычитал 88 из otherFinishing, а bindingPrice брал только 77 → undercharge.
    templateConfigData.simplified.sizes[0].finishing = [];
    templateConfigData.simplified.multiPageStructure = {
      innerBlock: { pagesSource: 'parameter' },
      binding: { service_id: 77, units_per_item: 1 },
    };
    (PricingServiceRepository.listServiceTiers as jest.Mock).mockImplementation(async (serviceId: number) => {
      if (serviceId === 88) {
        return [{ id: 2, serviceId: 88, minQuantity: 1, rate: 2, isActive: true }];
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
          if (id === 77 || id === 88) return { id, operation_type: 'bind', is_active: 1 };
          return { id, operation_type: 'laminate', is_active: 1 };
        }
        return null;
      }),
      all: jest.fn(async (query: string) => {
        if (String(query).includes('FROM post_processing_services') && String(query).includes('id IN')) {
          return [{
            id: 88,
            name: 'Термоклей',
            operation_type: 'bind',
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
        finishing: [{ service_id: 88, units_per_item: 1 }],
      } as any,
      100,
    );

    // print 4×100×2=800; finishing bind 88: 2×100=200; configured bind 77: 50
    expect(result.breakdown?.otherFinishingPrice).toBe(200);
    expect(result.breakdown?.bindingPrice).toBe(50);
    expect(result.finalPrice).toBe(1050);
    expect(result.finishingDetails?.some((d) => d.service_id === 88 && Number(d.priceForQuantity) === 200)).toBe(
      true,
    );
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

  it('ламинирует только листы обложки, не блок', async () => {
    templateConfigData.simplified.sizes[0].width_mm = 148;
    templateConfigData.simplified.sizes[0].height_mm = 210;
    templateConfigData.simplified.sizes[0].finishing = [{ service_id: 88, price_unit: 'per_sheet', units_per_item: 1 }];
    templateConfigData.simplified.multiPageStructure = {
      innerBlock: { pagesSource: 'parameter' },
      cover: {
        mode: 'separate',
        page_count: 2,
        print: { technology_code: 'laser_prof', color_mode: 'color', sides_mode: 'single' },
        lamination: { service_id: 88 },
      },
    };
    (PricingServiceRepository.listServiceTiers as jest.Mock).mockImplementation(async (serviceId: number) => {
      if (serviceId === 88) return [{ id: 1, serviceId: 88, minQuantity: 1, rate: 3, isActive: true }];
      return [];
    });
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string, params?: unknown[]) => {
        if (query.includes('FROM products WHERE id = ?')) return productRow;
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) };
        }
        if (query.includes('FROM post_processing_services')) {
          const id = Number(params?.[0]);
          if (id === 88) {
            return {
              id: 88,
              name: 'Ламинация',
              operation_type: 'laminate',
              price_unit: 'per_sheet',
              price: 3,
              min_quantity: 1,
              is_active: 1,
            };
          }
          return { id, operation_type: 'laminate', is_active: 1, price_unit: 'per_sheet', price: 3, name: 'Ламинация' };
        }
        return null;
      }),
      all: jest.fn(async (query: string) => {
        if (String(query).includes('FROM post_processing_services') && String(query).includes('id IN')) {
          return [{
            id: 88,
            name: 'Ламинация',
            operation_type: 'laminate',
            price_unit: 'per_sheet',
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
        pages: 102 as any,
      } as any,
      10,
    );

    // 100 стр. блока single: 100 листов × 10. Обложка 2 стр. single: 2 × 10 = 20 листов.
    // Печать блока 1000 × 2 BYN = 2000, обложка 20 × 2 = 40, ламинация 20 × 3 = 60.
    // Та же услуга в finishing размера не должна добавить 1000 листов блока.
    const lamination = (result.finishingDetails ?? []).filter((row) => row.service_id === 88);
    expect(lamination).toHaveLength(1);
    expect(lamination[0].units_needed).toBe(20);
    expect(lamination[0].priceForQuantity).toBe(60);
    expect(result.breakdown?.coverPrice).toBe(40);
    expect(result.finalPrice).toBe(2100);
  });

  it('каширует бумагу на картон: 2 картона на изделие, печать обложки остаётся', async () => {
    templateConfigData.simplified.include_material_cost = true;
    templateConfigData.simplified.multiPageStructure = {
      innerBlock: { pagesSource: 'parameter' },
      cover: {
        mode: 'separate',
        wrap: true,
        page_count: 4,
        board_material_ids: [41],
        print: { technology_code: 'laser_prof', color_mode: 'color', sides_mode: 'single' },
      },
    };
    mockedGetDb.mockResolvedValue({
      get: jest.fn(async (query: string, params?: unknown[]) => {
        if (query.includes('FROM products WHERE id = ?')) return productRow;
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) };
        }
        if (String(query).includes('sheet_price_single') && Number(params?.[0]) === 41) {
          return { name: 'Картон переплётный', sheet_price_single: 1.5 };
        }
        return null;
      }),
      all: jest.fn(async () => []),
      run: jest.fn(),
    } as any);

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

    // Кашировка — два листа бумаги и два картона, сохранённое «Страниц обложки» = 4 не читается.
    // Блок: 10 − 2 = 8 листов × 10 × 2 BYN = 160. Обложка 2 × 10 × 2 = 40. Картон 2 × 10 × 1.5 = 30.
    expect(result.breakdown?.innerBlockPrice).toBe(160);
    expect(result.breakdown?.coverPrice).toBe(70);
    expect(result.operationMaterials).toEqual([
      { material_id: 41, material_name: 'Картон переплётный', quantity: 20 },
    ]);
    expect(result.finalPrice).toBe(230);
  });

  describe('блокнот: листы блока и кашировка', () => {
    const BOARD_PRICE = 2.5;

    const notebookTemplate = (cover: Record<string, unknown>) => ({
      simplified: {
        include_material_cost: true,
        // Поле «Страницы» шаблона к листам не относится: 102 выходит за его границы 4–40.
        pages: { options: [], min: 4, max: 40, step: 4 },
        multiPageStructure: {
          coverChoice: 'printed',
          notebook: { use_sheets: true, sheets: 50 },
          // Прежняя ручная настройка: «фиксированные 50». При листах блока она не читается.
          innerBlock: { pagesSource: 'fixed', fixedPages: 50 },
          cover: {
            mode: 'separate',
            // Осталось от прежней настройки. Два картона — всегда 2 страницы.
            page_count: 4,
            allowed_material_ids: [11],
            material_id: 11,
            print: { technology_code: 'laser_sheet', color_mode: 'color', sides_mode: 'single' },
            lamination: { service_id: 8 },
            ...cover,
          },
          binding: { service_id: 77 },
        },
        sizes: [
          {
            id: 'a5',
            label: 'A5',
            width_mm: 148,
            height_mm: 210,
            allowed_material_ids: [12],
            print_prices: [
              {
                technology_code: 'laser_sheet',
                color_mode: 'color',
                sides_mode: 'single',
                tiers: [
                  { min_qty: 4, max_qty: 19, unit_price: 3 },
                  { min_qty: 20, max_qty: 39, unit_price: 1.65 },
                  { min_qty: 40, max_qty: 199, unit_price: 1.375 },
                  { min_qty: 200, unit_price: 0.625 },
                ],
              },
              {
                technology_code: 'laser_sheet',
                color_mode: 'color',
                sides_mode: 'duplex',
                tiers: [{ min_qty: 1, unit_price: 0 }],
              },
            ],
            material_prices: [],
            finishing: [],
          },
        ],
      },
    });

    const mountNotebook = (cover: Record<string, unknown>, itemsPerSheet = 1) => {
      templateConfigData = notebookTemplate(cover);
      (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layoutMock(itemsPerSheet));
      (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layoutMock(itemsPerSheet));
      (PricingServiceRepository.listServiceTiers as jest.Mock).mockImplementation(async (serviceId: number) =>
        serviceId === 8 ? [{ id: 1, serviceId: 8, minQuantity: 1, rate: 6, isActive: true }] : [],
      );
      mockedQuoteBinding.mockImplementation(async (request: { quantity: number }) => ({
        serviceId: 77,
        serviceName: 'Переплёт на пружину',
        priceUnit: 'per_item',
        unitPrice: 13.8,
        units: request.quantity,
        total: Math.round(13.8 * request.quantity * 100) / 100,
      }));
      const materials: Record<number, { name: string; sheet_price_single: number }> = {
        11: { name: 'Полуматовая бумага 350', sheet_price_single: 1.2 },
        12: { name: 'Офисная A4 80', sheet_price_single: 0.07 },
        41: { name: 'Картон переплётный', sheet_price_single: BOARD_PRICE },
      };
      mockedGetDb.mockResolvedValue({
        get: jest.fn(async (query: string, params?: unknown[]) => {
          const sql = String(query);
          if (sql.includes('FROM products WHERE id = ?')) return productRow;
          if (sql.includes('FROM product_template_configs')) {
            return { config_data: JSON.stringify(templateConfigData) };
          }
          if (sql.includes('FROM post_processing_services')) {
            const id = Number(params?.[0]);
            if (id === 77) return { id: 77, operation_type: 'bind', is_active: 1 };
            if (id === 8) {
              return {
                id: 8,
                name: 'Ламинация рулонная',
                operation_type: 'laminate',
                price_unit: 'per_sheet',
                price: 6,
                min_quantity: 1,
                is_active: 1,
              };
            }
            return null;
          }
          if (sql.includes('FROM materials')) return materials[Number(params?.[0])] ?? null;
          return null;
        }),
        all: jest.fn(async () => []),
        run: jest.fn(),
      } as any);
    };

    const notebookRequest = (extra: Record<string, unknown> = {}) => ({
      size_id: 'a5',
      print_technology: 'laser_sheet',
      print_color_mode: 'color',
      material_id: 12,
      cover_material_id: 11,
      notebook_sheets: 50,
      priceType: 'urgent',
      ...extra,
    });

    it('1 шт, 50 листов, обложка с кашировкой: 102 страницы без ручного ввода', async () => {
      mountNotebook({ wrap: true, board_material_ids: [41], board_material_id: 41 });

      const result = await SimplifiedPricingService.calculatePrice(
        1,
        // Клиент прислал чужие страницы и одну сторону: при листах блока они не читаются.
        notebookRequest({ pages: 4, sides: 1 }) as any,
        1,
      );

      // Блок: 50 листов с двух сторон, печать двухсторонней строки 0, бумага 50 × 0.07.
      expect(result.layout?.sheetsNeeded).toBe(50);
      expect(result.printPrice).toBe(0);
      expect(result.breakdown?.innerBlockPrice).toBe(3.5);
      // Обложка: 2 листа × 1.375 + 2 листа бумаги × 1.2 + 2 картона × 2.5.
      expect(result.breakdown?.coverPrice).toBe(10.15);
      // Ламинация: 2 листа обложки × 6. Блок и картон плёнкой не покрываются.
      const lamination = (result.finishingDetails ?? []).filter((row) => row.service_id === 8);
      expect(lamination).toHaveLength(1);
      expect(lamination[0].units_needed).toBe(2);
      expect(lamination[0].priceForQuantity).toBe(12);
      expect(result.breakdown?.bindingPrice).toBe(13.8);
      // Картон списывается штуками, своей строки услуги у кашировки нет.
      expect(result.operationMaterials).toEqual([
        { material_id: 41, material_name: 'Картон переплётный', quantity: 2 },
      ]);
      expect((result.finishingDetails ?? []).map((row) => row.operation_type)).toEqual(['laminate', 'bind']);
      expect(result.finalPrice).toBe(39.45);
      expect(result.tier_prices?.[0]).toMatchObject({ min_qty: 1, total_price: 39.45 });
    });

    it('срочная цена — база, стандартная — скидка типа цены', async () => {
      mountNotebook({ wrap: true, board_material_ids: [41], board_material_id: 41 });

      const urgent = await SimplifiedPricingService.calculatePrice(1, notebookRequest() as any, 1);
      const standard = await SimplifiedPricingService.calculatePrice(
        1,
        notebookRequest({ priceType: 'standard' }) as any,
        1,
      );

      expect(urgent.finalPrice).toBe(39.45);
      // 39.45 × 0.5 = 19.725, до копейки 19.73.
      expect(standard.finalPrice).toBe(19.73);
      expect(standard.breakdown?.bindingPrice).toBe(6.9);

      templateConfigData.simplified.price_type_multipliers = { standard: 0.8, urgent: 1 };
      const custom = await SimplifiedPricingService.calculatePrice(
        1,
        notebookRequest({ priceType: 'standard' }) as any,
        1,
      );
      expect(custom.finalPrice).toBe(31.56);
    });

    it('печать обложки с двух сторон не убавляет листы: картонов по-прежнему два', async () => {
      mountNotebook({ wrap: true, board_material_ids: [41], board_material_id: 41 });
      templateConfigData.simplified.sizes[0].print_prices[1].tiers = [{ min_qty: 1, unit_price: 2 }];

      const result = await SimplifiedPricingService.calculatePrice(
        1,
        notebookRequest({ cover_print_sides_mode: 'duplex' }) as any,
        1,
      );

      // Блок 50 листов × 2 = 100. Обложка: 2 листа × 2 + бумага 2.4 + картон 5.
      expect(result.printPrice).toBe(100);
      expect(result.breakdown?.coverPrice).toBe(11.4);
      const lamination = (result.finishingDetails ?? []).find((row) => row.service_id === 8);
      expect(lamination?.units_needed).toBe(2);
    });

    it('без кашировки два картона режутся раскладкой и считаются на весь тираж', async () => {
      mountNotebook({}, 4);

      const result = await SimplifiedPricingService.calculatePrice(1, notebookRequest() as any, 10);

      // 20 картонов по 4 на лист — 5 листов, не 10: лист не округляется на каждый блокнот.
      const lamination = (result.finishingDetails ?? []).find((row) => row.service_id === 8);
      expect(lamination?.units_needed).toBe(5);
      // Блок: 100 страниц по 8 на лист — 13 листов × 10. Обложка: 5 листов × 4 поля × 0.625 + 5 × 1.2.
      expect(result.layout?.sheetsNeeded).toBe(130);
      expect(result.breakdown?.coverPrice).toBe(18.5);
      expect(result.operationMaterials ?? []).toEqual([]);
    });

    it('листы блока приходят из шаблона, если калькулятор их не прислал', async () => {
      mountNotebook({ wrap: true, board_material_ids: [41], board_material_id: 41 });

      const result = await SimplifiedPricingService.calculatePrice(
        1,
        notebookRequest({ notebook_sheets: undefined }) as any,
        1,
      );

      expect(result.layout?.sheetsNeeded).toBe(50);
      expect(result.finalPrice).toBe(39.45);
    });

    it('блок без печати: бумага в цене, печать блока нет, ступень обложки — по листам обложки', async () => {
      mountNotebook({ wrap: true, board_material_ids: [41], board_material_id: 41 });
      templateConfigData.simplified.multiPageStructure.innerBlock = { pagesSource: 'parameter', printed: false };
      // Двухсторонняя строка с ценой: без флага блок стоил бы 50 листов × 2.
      templateConfigData.simplified.sizes[0].print_prices[1].tiers = [{ min_qty: 1, unit_price: 2 }];

      const result = await SimplifiedPricingService.calculatePrice(
        1,
        // Технологию печати оператор не выбирает: поле в калькуляторе скрыто.
        notebookRequest({ print_technology: undefined, print_color_mode: undefined }) as any,
        1,
      );

      expect(result.printPrice).toBe(0);
      expect(result.breakdown?.innerBlockPrice).toBe(3.5);
      // 50 непечатных листов блока тираж печати не поднимают: 2 листа обложки идут по первой ступени, 3.
      // Обложка: 2 × 3 + бумага 2.4 + картон 5.
      expect(result.breakdown?.coverPrice).toBe(13.4);
      expect(result.finalPrice).toBe(42.7);
      expect(result.tier_prices?.[0]).toMatchObject({ min_qty: 1, total_price: 42.7 });
      expect(result.warnings ?? []).toEqual([]);
    });

    it('предупреждает, если у печати обложки нет цены', async () => {
      mountNotebook({ wrap: true, board_material_ids: [41], board_material_id: 41 });
      templateConfigData.simplified.multiPageStructure.innerBlock = { pagesSource: 'parameter', printed: false };

      const result = await SimplifiedPricingService.calculatePrice(
        1,
        // «С двух сторон», а двухсторонняя строка печати размера пустая.
        notebookRequest({ cover_print_sides_mode: 'duplex' }) as any,
        1,
      );

      expect(result.breakdown?.coverPrice).toBe(7.4);
      expect(result.warnings).toEqual([
        'Печать обложки посчитана как 0: в печати размера нет цены в строке «laser_sheet, цвет, двухсторонняя».',
      ]);
    });

    it('отклоняет больше 500 листов блока', async () => {
      mountNotebook({ wrap: true, board_material_ids: [41], board_material_id: 41 });

      await expect(
        SimplifiedPricingService.calculatePrice(1, notebookRequest({ notebook_sheets: 501 }) as any, 1),
      ).rejects.toMatchObject({ status: 400, message: 'Листов блока: от 1 до 500' });
    });

    it('готовая крышка листами блока не считается: страницы берутся как раньше', async () => {
      mountNotebook({ mode: 'none' });
      templateConfigData.simplified.multiPageStructure.coverChoice = 'ready';
      templateConfigData.simplified.pages = { options: [], min: 4, max: 200, step: 2 };
      templateConfigData.simplified.multiPageStructure.innerBlock = { pagesSource: 'parameter' };

      const result = await SimplifiedPricingService.calculatePrice(
        1,
        notebookRequest({ pages: 40, sides: 2 }) as any,
        1,
      );

      expect(result.layout?.sheetsNeeded).toBe(20);
    });

    it('sticky printed:false без use_sheets не обнуляет печать обычного multi_page', async () => {
      // Сценарий после снятия «листы блока»: use_sheets=false, а printed:false остался от applySheetBlock.
      templateConfigData.simplified.include_material_cost = false;
      templateConfigData.simplified.pages = { options: [], min: 4, max: 200, step: 2 };
      templateConfigData.simplified.multiPageStructure = {
        coverChoice: 'printed',
        notebook: { use_sheets: false, sheets: 50 },
        innerBlock: { pagesSource: 'parameter', printed: false },
        cover: { mode: 'none' },
      };
      templateConfigData.simplified.sizes = [
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
      ];
      (LayoutCalculationService.calculateLayout as jest.Mock).mockReturnValue(layoutMock(1));
      (LayoutCalculationService.findOptimalSheetSize as jest.Mock).mockReturnValue(layoutMock(1));

      const result = await SimplifiedPricingService.calculatePrice(
        1,
        {
          size_id: 'a4',
          print_technology: 'laser_prof',
          print_color_mode: 'color',
          print_sides_mode: 'single',
          pages: 10,
        } as any,
        10,
      );

      // 10 стр. × 10 шт × 2 BYN — печать блока на месте, несмотря на sticky printed:false.
      expect(result.printPrice).toBe(200);
      expect(result.finalPrice).toBe(200);
    });
  });
});

