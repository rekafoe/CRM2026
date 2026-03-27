import { getDb } from '../../../db';
import { logger } from '../../../utils/logger';
import productSchemas from '../../../data/product_schemas.json';
import { BindingPricingService } from './bindingPricingService';

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

export class MultipageValidationError extends Error {
  readonly details: string[];

  constructor(details: string[]) {
    super('Некорректные параметры расчета');
    this.name = 'MultipageValidationError';
    this.details = details;
  }
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

const printTypeAliases: Record<string, string[]> = {
  laser_bw: ['laser_bw', 'лазерная черно-белая', 'лазер ч/б', 'laser bw', 'laser black white'],
  laser_color: ['laser_color', 'лазерная цветная', 'лазер цвет', 'laser color'],
  digital_bw: ['digital_bw', 'цифровая черно-белая', 'цифровая ч/б', 'digital bw', 'digital black white'],
  digital_color: ['digital_color', 'цифровая цветная', 'digital color'],
  offset: ['offset', 'офсет', 'offset print'],
};

const bindingTypeAliases: Record<string, string[]> = {
  none: ['none', 'без переплета', 'без переплёта'],
  plastic_spring: ['plastic_spring', 'пластиковая пружина', 'пружина пластик', 'plastic spring'],
  metal_spring: ['metal_spring', 'металлическая пружина', 'пружина металл', 'metal spring'],
  hardcover: ['hardcover', 'твердый', 'твёрдый', 'hard cover', 'hardcover'],
  simple_channel: ['simple_channel', 'симпл ченл', 'simple channel', 'channel'],
  c_bind: ['c_bind', 'c-bind', 'c bind'],
  staple: ['staple', 'на скобу', 'скоба'],
  corner_staple: ['corner_staple', 'скоба в уголке', 'уголок', 'corner staple'],
  rings: ['rings', 'кольца', 'на кольца'],
  screws: ['screws', 'винты', 'на винты'],
  softcover: ['softcover', 'мягкий', 'кбс', 'soft cover', 'softcover'],
  archive: ['archive', 'архивный'],
  folder: ['folder', 'в папку', 'папка'],
};

const normalizeLabel = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const isLabelMatch = (source: string, target: string) => {
  if (!source || !target) return false;
  return source.includes(target) || target.includes(source);
};

export class MultipageProductService {
  private static getFieldConfig(fieldName: string) {
    return schema?.fields?.find((field: any) => field.name === fieldName);
  }

  private static getFieldDefault<T>(fieldName: string, fallback: T): T {
    const field = this.getFieldConfig(fieldName);
    return (field?.default ?? fallback) as T;
  }

  private static getFieldEnumValues(fieldName: string): string[] {
    const field = this.getFieldConfig(fieldName);
    const enumValues = field?.enum ?? [];
    return enumValues.map((item: any) => {
      if (typeof item === 'string' || typeof item === 'number') {
        return String(item);
      }
      return String(item?.value ?? '');
    }).filter(Boolean);
  }

  private static normalizeInput(params: Partial<MultipageCalculationParams>): MultipageCalculationParams {
    const errors: string[] = [];
    const normalized: MultipageCalculationParams = {
      pages: Number(params.pages ?? this.getFieldDefault('pages', 20)),
      quantity: Number(params.quantity ?? 1),
      format: String(params.format ?? this.getFieldDefault('format', 'A4')),
      printType: String(params.printType ?? this.getFieldDefault('printType', 'laser_bw')),
      bindingType: String(params.bindingType ?? this.getFieldDefault('bindingType', 'none')),
      paperType: String(params.paperType ?? this.getFieldDefault('paperType', 'office_premium')),
      paperDensity: Number(params.paperDensity ?? this.getFieldDefault('paperDensity', 80)),
      duplex: Boolean(params.duplex ?? this.getFieldDefault('duplex', false)),
      lamination: String(params.lamination ?? this.getFieldDefault('lamination', 'none')),
      trimMargins: Boolean(params.trimMargins ?? this.getFieldDefault('trimMargins', false)),
    };

    if (!Number.isInteger(normalized.pages) || normalized.pages < 4) {
      errors.push('pages должен быть целым числом не меньше 4');
    }

    if (!Number.isInteger(normalized.quantity) || normalized.quantity < 1) {
      errors.push('quantity должен быть целым числом не меньше 1');
    }

    if (!Number.isFinite(normalized.paperDensity) || normalized.paperDensity <= 0) {
      errors.push('paperDensity должен быть положительным числом');
    }

    const formatOptions = this.getFieldEnumValues('format');
    if (formatOptions.length > 0 && !formatOptions.includes(normalized.format)) {
      errors.push(`format должен быть одним из: ${formatOptions.join(', ')}`);
    }

    const printTypeOptions = this.getFieldEnumValues('printType');
    if (printTypeOptions.length > 0 && !printTypeOptions.includes(normalized.printType)) {
      errors.push(`printType должен быть одним из: ${printTypeOptions.join(', ')}`);
    }

    const bindingTypeOptions = this.getFieldEnumValues('bindingType');
    if (bindingTypeOptions.length > 0 && !bindingTypeOptions.includes(normalized.bindingType)) {
      errors.push(`bindingType должен быть одним из: ${bindingTypeOptions.join(', ')}`);
    }

    const paperTypeOptions = this.getFieldEnumValues('paperType');
    if (paperTypeOptions.length > 0 && !paperTypeOptions.includes(normalized.paperType)) {
      errors.push(`paperType должен быть одним из: ${paperTypeOptions.join(', ')}`);
    }

    const laminationOptions = this.getFieldEnumValues('lamination');
    if (laminationOptions.length > 0 && !laminationOptions.includes(normalized.lamination)) {
      errors.push(`lamination должен быть одним из: ${laminationOptions.join(', ')}`);
    }

    const paperDensityOptions = this.getFieldEnumValues('paperDensity').map((value) => Number(value));
    if (paperDensityOptions.length > 0 && !paperDensityOptions.includes(normalized.paperDensity)) {
      errors.push(`paperDensity должен быть одним из: ${paperDensityOptions.join(', ')}`);
    }

    if (errors.length > 0) {
      throw new MultipageValidationError(errors);
    }

    return normalized;
  }

  private static findMappedKey(
    sourceValue: unknown,
    aliases: Record<string, string[]>
  ): string | null {
    const normalizedSource = normalizeLabel(sourceValue);
    if (!normalizedSource) return null;

    for (const [key, keyAliases] of Object.entries(aliases)) {
      const normalizedKey = normalizeLabel(key.replace(/_/g, ' '));
      if (normalizedSource.includes(normalizedKey)) {
        return key;
      }
      if (keyAliases.some((alias) => normalizedSource.includes(normalizeLabel(alias)))) {
        return key;
      }
    }

    return null;
  }

  private static getBindingMatchScore(
    serviceName: string,
    bindingType: string,
    bindingLabel: string
  ): number {
    const normalizedService = normalizeLabel(serviceName);
    if (!normalizedService) return 0;

    let score = 0;
    const typeKey = normalizeLabel(bindingType.replace(/_/g, ' '));
    const labelKey = normalizeLabel(bindingLabel);

    if (normalizedService.includes(typeKey)) score += 4;
    if (isLabelMatch(normalizedService, labelKey)) score += 3;

    const aliases = bindingTypeAliases[bindingType] || [];
    if (aliases.some((alias) => normalizedService.includes(normalizeLabel(alias)))) {
      score += 5;
    }

    return score;
  }

  /**
   * Рассчитать стоимость многостраничной продукции
   */
  static async calculate(rawParams: Partial<MultipageCalculationParams>): Promise<MultipageCalculationResult> {
    const params = this.normalizeInput(rawParams);
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

    // Стоимость переплёта (берём из услуг с типом bind, если есть)
    const bindingUnitPrice =
      (await this.getBindingUnitPriceFromDb(bindingType, quantity)) ??
      pricing.bindingPrices[bindingType] ??
      0;
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
        SELECT name, price, operation_type, price_unit
        FROM post_processing_services
        WHERE operation_type IN ('print', 'printing') AND is_active = 1
      `);

      // Получаем цены переплёта
      const bindingServices = await db.all(`
        SELECT name, price
        FROM post_processing_services
        WHERE operation_type IN ('bind') AND is_active = 1
      `);

      if (printServices.length === 0 && bindingServices.length === 0) {
        return null;
      }

      // Маппинг названий услуг к ключам
      const printMap: Record<string, any> = { ...defaultPricing.printPrices };
      const bindingMap: Record<string, number> = { ...defaultPricing.bindingPrices };

      for (const service of printServices) {
        const mappedKey = this.findMappedKey(
          `${service.name || ''} ${service.operation_type || ''} ${service.price_unit || ''}`,
          printTypeAliases
        );
        if (!mappedKey) continue;

        const perPage = Number(service.price);
        if (!Number.isFinite(perPage)) continue;

        printMap[mappedKey] = {
          perPage,
          setup: mappedKey === 'offset' ? (defaultPricing.printPrices.offset?.setup ?? 50) : 0
        };
      }

      for (const service of bindingServices) {
        const mappedKey = this.findMappedKey(service.name, bindingTypeAliases);
        const price = Number(service.price);
        if (!mappedKey || !Number.isFinite(price)) continue;

        bindingMap[mappedKey] = price;
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

  private static async getBindingUnitPriceFromDb(
    bindingType: string,
    quantity: number
  ): Promise<number | null> {
    try {
      const db = await getDb();
      const bindingField = schema?.fields?.find((f: any) => f.name === 'bindingType');
      const bindingOption = (bindingField?.enum || []).find((opt: any) =>
        typeof opt === 'string' ? opt === bindingType : opt.value === bindingType
      );
      const bindingLabel =
        typeof bindingOption === 'string'
          ? bindingOption
          : bindingOption?.label ?? bindingType;

      const services = await db.all<Array<{ id: number; name: string; price: number }>>(
        `
        SELECT id, name, price
        FROM post_processing_services
        WHERE operation_type IN ('bind') AND is_active = 1
      `
      );
      if (!services.length) return null;

      const normalizedBinding = normalizeLabel(bindingLabel);
      const matched = services
        .map((service) => ({
          service,
          score: this.getBindingMatchScore(service.name, bindingType, bindingLabel)
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)[0]?.service;
      if (!matched) return null;

      const quote = await BindingPricingService.quoteBinding({
        serviceId: matched.id,
        quantity,
        unitsPerItem: 1,
      });
      return quote.units > 0 ? quote.total / quote.units : quote.unitPrice;
    } catch (error) {
      logger.warn('Error getting binding price from DB', { error, bindingType });
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
