import { getDb } from '../../../db';
import { logger } from '../../../utils/logger';
import productSchemas from '../../../data/product_schemas.json';

export interface MultipageCalculationParams {
  pages: number;
  quantity: number;
  format: string;
  printType: string;
  bindingType: string;
  paperType: string;
  paperDensity: number;
  duplex: boolean;
  lamination: string;
  trimMargins: boolean;
}

export interface MultipageCalculationResult {
  totalCost: number;
  pricePerItem: number;
  breakdown: {
    printCost: number;
    bindingCost: number;
    paperCost: number;
    laminationCost: number;
    trimCost: number;
    setupCost: number;
  };
  sheets: number;
  warnings: string[];
}

const schema = (productSchemas as any).schemas?.multipage;
const bindingRules = schema?.bindingRules || {};
const defaultPricing = schema?.pricing || {
  printPrices: {
    laser_bw: { perPage: 0.5, setup: 0 },
    laser_color: { perPage: 3.0, setup: 0 },
    digital_bw: { perPage: 0.4, setup: 0 },
    digital_color: { perPage: 2.5, setup: 0 },
    offset: { perPage: 0.2, setup: 50 }
  },
  bindingPrices: {
    none: 0,
    plastic_spring: 3.0,
    metal_spring: 5.0,
    hardcover: 25.0,
    simple_channel: 4.0,
    c_bind: 6.0,
    staple: 1.0,
    corner_staple: 0.5,
    rings: 8.0,
    screws: 10.0,
    softcover: 15.0,
    archive: 20.0,
    folder: 5.0
  },
  laminationPrices: {
    none: 0,
    matte: 1.5,
    glossy: 1.5
  },
  trimPrice: 2.0
};

export class MultipageProductService {
  /**
   * Рассчитать стоимость многостраничной продукции
   */
  static async calculate(params: MultipageCalculationParams): Promise<MultipageCalculationResult> {
    const {
      pages,
      quantity,
      format,
      printType,
      bindingType,
      paperType,
      paperDensity,
      duplex,
      lamination,
      trimMargins
    } = params;

    const warnings: string[] = [];

    // Проверяем ограничения переплёта
    const bindingRule = bindingRules[bindingType];
    if (bindingRule) {
      if (bindingRule.minPages && pages < bindingRule.minPages) {
        warnings.push(`Минимум ${bindingRule.minPages} страниц для типа переплета "${bindingType}"`);
      }
      if (bindingRule.maxPages && pages > bindingRule.maxPages) {
        warnings.push(`Максимум ${bindingRule.maxPages} страниц для типа переплета "${bindingType}"`);
      }
    }

    // Получаем цены из БД или используем дефолтные
    const pricing = await this.getPricingFromDb() || defaultPricing;

    // Расчет количества листов
    const sheets = duplex ? Math.ceil(pages / 2) : pages;

    // Стоимость печати
    const printPrice = pricing.printPrices[printType] || { perPage: 1, setup: 0 };
    const printCost = (printPrice.perPage * pages * quantity);
    const setupCost = printPrice.setup || 0;

    // Стоимость переплёта
    const bindingUnitPrice = pricing.bindingPrices[bindingType] || 0;
    const bindingCost = bindingUnitPrice * quantity;

    // Стоимость ламинации (по листам)
    const laminationPrice = pricing.laminationPrices[lamination] || 0;
    const laminationCost = laminationPrice * sheets * quantity;

    // Стоимость обрезки
    const trimCost = trimMargins ? (pricing.trimPrice * quantity) : 0;

    // Стоимость бумаги (базовая оценка, можно уточнить из склада)
    const paperCost = await this.calculatePaperCost(format, paperType, paperDensity, sheets, quantity);

    const totalCost = printCost + bindingCost + paperCost + laminationCost + trimCost + setupCost;
    const pricePerItem = quantity > 0 ? totalCost / quantity : 0;

    logger.info('Multipage calculation completed', {
      params,
      result: { totalCost, pricePerItem, sheets }
    });

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      pricePerItem: Math.round(pricePerItem * 100) / 100,
      breakdown: {
        printCost: Math.round(printCost * 100) / 100,
        bindingCost: Math.round(bindingCost * 100) / 100,
        paperCost: Math.round(paperCost * 100) / 100,
        laminationCost: Math.round(laminationCost * 100) / 100,
        trimCost: Math.round(trimCost * 100) / 100,
        setupCost: Math.round(setupCost * 100) / 100
      },
      sheets,
      warnings
    };
  }

  /**
   * Получить цены из базы данных
   */
  private static async getPricingFromDb(): Promise<typeof defaultPricing | null> {
    try {
      const db = await getDb();
      
      // Получаем цены печати из post_processing_services
      const printServices = await db.all(`
        SELECT name, price, operation_type
        FROM post_processing_services
        WHERE operation_type IN ('print', 'printing') AND is_active = 1
      `);

      // Получаем цены переплёта
      const bindingServices = await db.all(`
        SELECT name, price
        FROM post_processing_services
        WHERE operation_type IN ('binding', 'postprint') AND is_active = 1
      `);

      if (printServices.length === 0 && bindingServices.length === 0) {
        return null;
      }

      // Маппинг названий услуг к ключам
      const printMap: Record<string, any> = { ...defaultPricing.printPrices };
      const bindingMap: Record<string, number> = { ...defaultPricing.bindingPrices };

      for (const service of printServices) {
        const name = String(service.name || '').toLowerCase();
        if (name.includes('лазер') && name.includes('ч/б')) {
          printMap.laser_bw = { perPage: service.price, setup: 0 };
        } else if (name.includes('лазер') && name.includes('цвет')) {
          printMap.laser_color = { perPage: service.price, setup: 0 };
        } else if (name.includes('цифр') && name.includes('ч/б')) {
          printMap.digital_bw = { perPage: service.price, setup: 0 };
        } else if (name.includes('цифр') && name.includes('цвет')) {
          printMap.digital_color = { perPage: service.price, setup: 0 };
        } else if (name.includes('офсет')) {
          printMap.offset = { perPage: service.price, setup: 50 };
        }
      }

      for (const service of bindingServices) {
        const name = String(service.name || '').toLowerCase();
        if (name.includes('пружин') && name.includes('пластик')) {
          bindingMap.plastic_spring = service.price;
        } else if (name.includes('пружин') && name.includes('металл')) {
          bindingMap.metal_spring = service.price;
        } else if (name.includes('твёрд') || name.includes('твердый')) {
          bindingMap.hardcover = service.price;
        } else if (name.includes('скоб') && !name.includes('угол')) {
          bindingMap.staple = service.price;
        } else if (name.includes('скоб') && name.includes('угол')) {
          bindingMap.corner_staple = service.price;
        } else if (name.includes('кольц')) {
          bindingMap.rings = service.price;
        } else if (name.includes('винт')) {
          bindingMap.screws = service.price;
        } else if (name.includes('мягк') || name.includes('кбс')) {
          bindingMap.softcover = service.price;
        } else if (name.includes('архив')) {
          bindingMap.archive = service.price;
        } else if (name.includes('папк')) {
          bindingMap.folder = service.price;
        } else if (name.includes('симпл') || name.includes('channel')) {
          bindingMap.simple_channel = service.price;
        } else if (name.includes('c-bind') || name.includes('cbind')) {
          bindingMap.c_bind = service.price;
        }
      }

      return {
        printPrices: printMap,
        bindingPrices: bindingMap,
        laminationPrices: defaultPricing.laminationPrices,
        trimPrice: defaultPricing.trimPrice
      };
    } catch (error) {
      logger.error('Error getting pricing from DB', { error });
      return null;
    }
  }

  /**
   * Рассчитать стоимость бумаги
   */
  private static async calculatePaperCost(
    format: string,
    paperType: string,
    density: number,
    sheets: number,
    quantity: number
  ): Promise<number> {
    try {
      const db = await getDb();
      
      // Ищем материал в складе
      const material = await db.get(`
        SELECT price_per_unit
        FROM materials
        WHERE (name LIKE ? OR description LIKE ?)
          AND is_active = 1
        LIMIT 1
      `, [`%${paperType}%`, `%${density}%`]);

      if (material?.price_per_unit) {
        return material.price_per_unit * sheets * quantity;
      }

      // Базовая оценка по плотности
      const basePricePerSheet = density <= 100 ? 0.05 : density <= 170 ? 0.1 : 0.2;
      return basePricePerSheet * sheets * quantity;
    } catch (error) {
      logger.warn('Error calculating paper cost, using estimate', { error });
      return 0.05 * sheets * quantity;
    }
  }

  /**
   * Получить доступные типы переплёта с ограничениями
   */
  static getBindingTypes(): Array<{ value: string; label: string; maxPages?: number; minPages?: number; duplexDefault: boolean }> {
    const bindingField = schema?.fields?.find((f: any) => f.name === 'bindingType');
    const options = bindingField?.enum || [];
    
    return options.map((opt: any) => {
      const value = typeof opt === 'string' ? opt : opt.value;
      const label = typeof opt === 'string' ? opt : opt.label;
      const rules = bindingRules[value] || {};
      
      return {
        value,
        label,
        maxPages: rules.maxPages,
        minPages: rules.minPages,
        duplexDefault: rules.duplexDefault ?? false,
        description: rules.description
      };
    });
  }

  /**
   * Получить схему для UI
   */
  static getSchema() {
    return schema;
  }
}
