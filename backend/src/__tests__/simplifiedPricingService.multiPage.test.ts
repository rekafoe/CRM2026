import { SimplifiedPricingService } from '../modules/pricing/services/simplifiedPricingService';
import { LayoutCalculationService } from '../modules/pricing/services/layoutCalculationService';
import { getDb } from '../db';
import { BindingPricingService } from '../modules/pricing/services/bindingPricingService';

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

jest.mock('../modules/pricing/services/bindingPricingService', () => ({
  BindingPricingService: {
    quoteBinding: jest.fn(),
  },
}));

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
      get: jest.fn(async (query: string) => {
        if (query.includes('FROM products WHERE id = ?')) return productRow;
        if (query.includes('FROM product_template_configs')) {
          return { config_data: JSON.stringify(templateConfigData) };
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
});

