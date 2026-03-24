/**
 * Гибкий сервис ценообразования на основе операций
 * 
 * Вместо хардкода операций в коде, использует таблицы:
 * - post_processing_services (операции)
 * - product_operations_link (связь продукт→операции)
 * - operation_pricing_rules (правила ценообразования)
 */

import { getDb } from '../../../db';
import { getTableColumns } from '../../../utils/tableSchemaCache';
import { LayoutCalculationService, ProductSize, LayoutResult } from './layoutCalculationService';
import { logger } from '../../../utils/logger';
import { PrintPriceService } from './printPriceService';
import { PricingServiceRepository } from '../repositories/serviceRepository';
import { PriceTypeService } from './priceTypeService';

/** Категория материалов «Рулонная бумага» — для неё не учитывается раскладка (расход по количеству изделий, не по листам). */
const ROLL_PAPER_CATEGORY_NAME = 'Рулонная бумага';

export interface OperationCostDetail {
  operationId: number;
  operationName: string;
  operationType: string;
  priceUnit: string;
  unitPrice: number;
  quantity: number;
  setupCost: number;
  totalCost: number;
  appliedRules?: string[];
  // Debug/trace for pricing
  pricingSource?: 'print_prices' | 'operation_base';
  pricingKey?: string;
  technologyCode?: string;
}

export interface MaterialCostDetail {
  materialId: number;
  materialName: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;
}

export interface FlexiblePricingResult {
  productId: number;
  productName: string;
  quantity: number;
  productSize: ProductSize;
  layout: any;
  sheetsNeeded?: number; // 📄 Количество листов для печати
  itemsPerSheet?: number; // 📐 Укладка: сколько изделий на лист
  cutsPerSheet?: number; // 🔪 Количество резов на лист
  numberOfStacks?: number; // 📚 Количество стоп для резки
  
  materials: MaterialCostDetail[];
  operations: OperationCostDetail[];
  
  materialCost: number;
  operationsCost: number;
  setupCosts: number;
  subtotal: number;
  
  markup: number;
  discountPercent: number;
  discountAmount: number;
  
  finalPrice: number;
  pricePerUnit: number;
}

export class FlexiblePricingService {
  /**
   * Рассчитывает цену продукта через систему операций
   */
  static async calculatePrice(
    productId: number,
    configuration: any,
    quantity: number
  ): Promise<FlexiblePricingResult> {
    try {
      const db = await getDb();

      // 0. Читаем все настройки наценок из БД
      const markupSettings = await this.getAllMarkupSettings();

      // 1. Получаем продукт
      const product = await db.get(`
        SELECT p.*, pc.name as category_name 
        FROM products p 
        JOIN product_categories pc ON p.category_id = pc.id 
        WHERE p.id = ?
      `, [productId]);

      logger.info('🔍 FlexiblePricingService: поиск продукта', { 
        productId, 
        product, 
        query: 'SELECT p.*, pc.name as category_name FROM products p JOIN product_categories pc ON p.category_id = pc.id WHERE p.id = ?'
      });

      if (!product) {
        throw new Error('Product not found');
      }

      // Определяем тип продукта для правильного расчета скидок
      let productType = this.mapNameToProductType(product.name);

      // Временный хак для буклетов
      if (product.id === 62 || product.name.includes('буклет') || product.name.includes('букле')) {
        productType = 'multi_page';
      }

      logger.info('💰 FlexiblePricingService: расчет цены для продукта', {
        productId,
        productName: product.name,
        productType,
        quantity,
        materialId: configuration.material_id,
        trimSize: configuration.trim_size,
        printSheet: configuration.print_sheet
      });

      // 2. Получаем trim_size из шаблона продукта
      let templateTrimSize: { width: number; height: number } | null = null;
      try {
        const templateConfig = await db.get(`
          SELECT config_data FROM product_template_configs 
          WHERE product_id = ? AND name = 'template' AND is_active = 1
          ORDER BY id DESC LIMIT 1
        `, [productId]);
        
        if (templateConfig?.config_data) {
          const configData = typeof templateConfig.config_data === 'string' 
            ? JSON.parse(templateConfig.config_data)
            : templateConfig.config_data;
          
          if (configData?.trim_size?.width && configData?.trim_size?.height) {
            templateTrimSize = {
              width: Number(configData.trim_size.width),
              height: Number(configData.trim_size.height)
            };
            logger.info('📐 Найден trim_size в шаблоне продукта', { 
              productId, 
              trimSize: templateTrimSize 
            });
          }
        }
      } catch (error) {
        logger.warn('⚠️ Не удалось загрузить trim_size из шаблона', { productId, error });
      }

      // 3. Определяем финальный размер: приоритет у размера из конфигурации!
      // ✅ ИСПРАВЛЕНО: Если пользователь явно выбрал формат в калькуляторе - используем его
      // Размер из шаблона используется только как fallback, если формат не указан
      let finalTrimSize = configuration.trim_size || templateTrimSize;
      
      // ✅ ВАЖНО: Размер из конфигурации имеет приоритет над размером из шаблона
      // Если пользователь явно выбрал формат (A4, A5, A6, A3 или кастомный) - используем его
      if (configuration.trim_size) {
        // Всегда используем размер из конфигурации, если он указан
        // Это означает, что пользователь явно выбрал формат в калькуляторе
        logger.info('✅ Используем размер из конфигурации (явный выбор пользователя)', {
          configSize: configuration.trim_size,
          templateSize: templateTrimSize,
          format: configuration.format
        });
        finalTrimSize = configuration.trim_size;
      } else if (templateTrimSize) {
        // Используем размер из шаблона только если в конфигурации не указан размер
        logger.info('ℹ️ Используем размер из шаблона продукта (fallback)', {
          templateSize: templateTrimSize
        });
        finalTrimSize = templateTrimSize;
      }
      
      logger.info('📐 Извлечение размеров продукта', {
        productId,
        configurationTrimSize: configuration.trim_size,
        templateTrimSize,
        finalTrimSize,
        configuration: JSON.stringify(configuration).substring(0, 200)
      });
      
      const productSize = this.extractProductSize({
        ...configuration,
        // Используем trim_size из конфигурации или из шаблона
        trim_size: finalTrimSize
      });
      
      logger.info('📏 Размер продукта для расчета раскладки', {
        productId,
        productSize,
        quantity
      });

      // Печатный лист = выбранный материал (если у материала заданы sheet_width/sheet_height), иначе SRA3/A3/A4
      const flexCutMarginMm: number | undefined = (configuration as any).cut_margin_mm != null
        ? Number((configuration as any).cut_margin_mm)
        : undefined;
      const flexCutGapMm: number | undefined = (configuration as any).cut_gap_mm != null
        ? Number((configuration as any).cut_gap_mm)
        : undefined;
      let layout: LayoutResult;
      if (configuration.material_id) {
        const db = await getDb();
        const materialSheet = await db.get<{ sheet_width: number | null; sheet_height: number | null }>(
          `SELECT sheet_width, sheet_height FROM materials WHERE id = ?`,
          [configuration.material_id]
        );
        const mw = materialSheet?.sheet_width != null && materialSheet.sheet_width > 0 ? Number(materialSheet.sheet_width) : 0;
        const mh = materialSheet?.sheet_height != null && materialSheet.sheet_height > 0 ? Number(materialSheet.sheet_height) : 0;
        if (mw > 0 && mh > 0) {
          layout = LayoutCalculationService.calculateLayout(productSize, { width: mw, height: mh }, flexCutMarginMm, flexCutGapMm);
          logger.info('Раскладка по размеру листа выбранного материала', {
            material_id: configuration.material_id,
            sheet_width: mw,
            sheet_height: mh,
            itemsPerSheet: layout.itemsPerSheet,
            cut_margin_mm: flexCutMarginMm,
            cut_gap_mm: flexCutGapMm,
          });
        } else {
          layout = LayoutCalculationService.findOptimalSheetSize(productSize, flexCutMarginMm, flexCutGapMm);
        }
      } else {
        layout = LayoutCalculationService.findOptimalSheetSize(productSize, flexCutMarginMm, flexCutGapMm);
      }
      
      logger.info('📊 Результат расчета раскладки', {
        productId,
        layout: {
          itemsPerSheet: layout.itemsPerSheet,
          sheetsNeeded: Math.ceil(quantity / layout.itemsPerSheet),
          recommendedSheetSize: layout.recommendedSheetSize,
          cutsPerSheet: layout.cutsPerSheet
        },
        quantity
      });
      
      if (!layout.fitsOnSheet) {
        throw new Error('Product size is too large for available sheet sizes');
      }

      // Рассчитываем количество листов в зависимости от типа продукта
      let sheetsNeeded: number;

      if (this.isMultiPageProduct(productType)) {
        // 📚 Многостраничные продукты: sheetsNeeded = количество листов на экземпляр
        const pagesPerItem = configuration.pages || configuration.page_count || configuration.pageCount || 1;
        const isDuplex = configuration.sides === 'duplex' || configuration.double_sided;

        // Определяем формат страниц для расчета вместимости листа
        const pageFormat = configuration.format || configuration.page_format || 'A4';
        const formatLower = pageFormat.toLowerCase();

        // Количество разворотов, помещающихся на ОДНУ СТОРОНУ листа SRA3
        let spreadsPerSheetSide: number;
        if (formatLower.includes('a6')) {
          spreadsPerSheetSide = 4; // A6: 4 разворота на одну сторону листа SRA3
        } else if (formatLower.includes('a5')) {
          spreadsPerSheetSide = 2; // A5: 2 разворота на одну сторону листа SRA3
        } else {
          spreadsPerSheetSide = 1; // A4: 1 разворот на одну сторону листа SRA3
        }

        // Учитываем двустороннюю печать: на одном листе можно печатать с двух сторон
        const spreadsPerSheet = spreadsPerSheetSide * (isDuplex ? 2 : 1);

        // Рассчитываем количество разворотов в продукте
        const spreadsNeeded = isDuplex ? Math.ceil(pagesPerItem / 2) : pagesPerItem;

        // Рассчитываем количество листов с учетом двусторонней печати
        sheetsNeeded = Math.ceil(spreadsNeeded / spreadsPerSheet);

        logger.info('📚 Расчет листов для многостраничного продукта', {
          pagesPerItem,
          pageFormat,
          spreadsPerSheetSide,
          spreadsPerSheet,
          spreadsNeeded,
          sheetsNeeded,
          isDuplex,
          configuration: {
            pages: configuration.pages,
            format: configuration.format,
            sides: configuration.sides
          }
        });

        // Переопределяем layout для многостраничных продуктов
        layout.itemsPerSheet = 1;
      } else {
        // 📄 Обычные продукты: sheetsNeeded = ceil(quantity / itemsPerSheet)
        sheetsNeeded = Math.ceil(quantity / layout.itemsPerSheet);
      }

      // 📚 Рассчитываем количество стоп для резки
      const STACK_HEIGHT_MM = 50; // Макс. высота стопы в гильотине: 5 см
      const SHEET_THICKNESS_MM = 0.15; // Средняя толщина листа
      const sheetsPerStack = Math.floor(STACK_HEIGHT_MM / SHEET_THICKNESS_MM);
      const numberOfStacks = Math.ceil(sheetsNeeded / sheetsPerStack);

      // 4. Получаем операции продукта
      const operations = await this.getProductOperations(productId, configuration);
      logger.info('🔧 Найдено операций для продукта', { 
        productId, 
        operationsCount: operations.length,
        operations: operations.map(op => ({ id: op.id, name: op.name, price: op.price }))
      });
      
      // 5. Рассчитываем стоимость каждой операции
      const operationCosts: OperationCostDetail[] = [];
      let totalOperationsCost = 0;
      let totalSetupCost = 0;

      // ✅ Печать как "скрытая" операция:
      // Если в продукте настроены разрешенные технологии/цвет/стороны (в UI вкладка "Печать"),
      // то печать должна участвовать в расчёте даже без явного post_processing_service "Печать".
      const hasPrintParams = !!configuration.print_technology && !!configuration.print_color_mode;
      const hasPrintOperation = operations.some((op) => {
        const nameLower = (op?.name || '').toString().toLowerCase();
        return op?.operation_type === 'print' || nameLower.includes('печать') || nameLower.includes('print');
      });
      if (hasPrintParams && !hasPrintOperation) {
        const virtualPrintOperation = {
          id: -1,
          name: 'Печать',
          operation_type: 'print',
          price_unit: 'per_sheet',
          unit: 'per_sheet',
          price: 0,
          setup_cost: 0,
          min_quantity: 1,
        };
        logger.info('🖨️ Добавляем виртуальную операцию печати (из настроек печати продукта)', {
          productId,
          print_technology: configuration.print_technology,
          print_color_mode: configuration.print_color_mode,
          sides: configuration.sides,
          sheetsNeeded,
        });

        const printCost = await this.calculateOperationCost(
          virtualPrintOperation,
          configuration,
          quantity,
          sheetsNeeded,
          productSize,
          layout,
          numberOfStacks,
          markupSettings,
        );
        operationCosts.push(printCost);
        totalOperationsCost += printCost.totalCost;
        totalSetupCost += printCost.setupCost;
      }

      logger.info('🔧 Начинаем расчет операций', {
        operationsCount: operations.length,
        operations: operations.map(op => ({
          id: op.id,
          name: op.name,
          operation_type: op.operation_type,
          price: op.price
        })),
        configuration: {
          print_technology: configuration.print_technology,
          print_color_mode: configuration.print_color_mode,
          sides: configuration.sides
        }
      });

      for (const operation of operations) {
        const operationCost = await this.calculateOperationCost(
          operation,
          configuration,
          quantity,
          sheetsNeeded,
          productSize,
          layout, // 📐 Передаем информацию о раскладке
          numberOfStacks, // 📚 Передаем количество стоп
          markupSettings // 🎯 Передаем настройки наценок
        );
        
        operationCosts.push(operationCost);
        totalOperationsCost += operationCost.totalCost;
        totalSetupCost += operationCost.setupCost;
        
        logger.info('💰 Операция рассчитана', {
          operationId: operation.id,
          operationName: operation.name,
          unitPrice: operationCost.unitPrice,
          quantity: operationCost.quantity,
          totalCost: operationCost.totalCost
        });
      }

      // 6. Рассчитываем стоимость материалов
      logger.info('💎 Начинаем расчет материалов', { productId, quantity, sheetsNeeded });
      const materialCosts = await this.calculateMaterialCosts(
        product,
        productSize,
        layout,
        configuration,
        quantity,
        sheetsNeeded
      );
      let totalMaterialCost = materialCosts.reduce((sum, m) => sum + m.totalCost, 0);
      logger.info('✅ Материалы рассчитаны', { materialCostsCount: materialCosts.length, totalMaterialCost });

      // 6. Промежуточная сумма
      let subtotal = totalMaterialCost + totalOperationsCost + totalSetupCost;

      // 7. Применяем наценку
      const markup = await this.getBaseMarkup();
      const priceWithMarkup = subtotal * markup;

      // 8. Применяем скидку за тираж / объём печати
      const isSra3 =
        !!layout?.recommendedSheetSize &&
        ((layout.recommendedSheetSize.width === 320 && layout.recommendedSheetSize.height === 450) ||
          (layout.recommendedSheetSize.width === 450 && layout.recommendedSheetSize.height === 320));
      const discountPercent = await this.getQuantityDiscount(sheetsNeeded, quantity, productType, isSra3 ? 'SRA3' : undefined);
      let discountAmount = priceWithMarkup * (discountPercent / 100);
      let finalPrice = priceWithMarkup - discountAmount;
      let pricePerUnit = finalPrice / quantity;

      // 9. Специальная логика для разных типов продуктов
      if (this.isSheetBasedProduct(productType) && layout.itemsPerSheet && layout.itemsPerSheet > 1) {
        // 📄 Листовые продукты: цена определяется листами печати
        const sheetPrice = finalPrice / sheetsNeeded; // Стоимость одного листа
        const pricePerFullSheet = sheetPrice / layout.itemsPerSheet; // Цена за изделие при полной загрузке листа

        finalPrice = pricePerFullSheet * quantity;
        pricePerUnit = pricePerFullSheet;
      } else if (this.isMultiPageProduct(productType)) {
        // 📚 Многостраничные продукты: цена за экземпляр = стоимость листов на один экземпляр
        // sheetsNeeded уже рассчитан как количество листов на один экземпляр
        // Для quantity экземпляров: финальная цена = стоимость одного экземпляра × quantity
        pricePerUnit = finalPrice; // Цена за один экземпляр (sheetsNeeded листов)
        finalPrice = finalPrice * quantity; // Цена за все экземпляры
      }

      // 10. Множитель типа цены (priceType)
      const priceTypeKey = String(
        configuration?.priceType ?? configuration?.price_type ?? configuration?.urgency ?? 'standard'
      ).trim().toLowerCase() || 'standard';
      const priceTypeMult = await PriceTypeService.getMultiplier(priceTypeKey);
      if (priceTypeMult !== 1) {
        logger.info('FlexiblePricingService: применяем множитель типа цены', { priceTypeKey, multiplier: priceTypeMult });
        finalPrice *= priceTypeMult;
        pricePerUnit *= priceTypeMult;
        totalMaterialCost *= priceTypeMult;
        totalOperationsCost *= priceTypeMult;
        totalSetupCost *= priceTypeMult;
        discountAmount *= priceTypeMult;
        subtotal *= priceTypeMult;
        materialCosts.forEach((m) => {
          m.unitPrice *= priceTypeMult;
          m.totalCost *= priceTypeMult;
        });
        operationCosts.forEach((o) => {
          o.unitPrice *= priceTypeMult;
          o.totalCost *= priceTypeMult;
        });
      }

      return {
        productId,
        productName: product.name,
        quantity,
        productSize,
        layout,
        sheetsNeeded, // 📄 Добавляем количество листов
        itemsPerSheet: layout.itemsPerSheet, // 📐 Добавляем укладку
        cutsPerSheet: layout.cutsPerSheet, // 🔪 Добавляем количество резов
        numberOfStacks, // 📚 Добавляем количество стоп
        
        materials: materialCosts,
        operations: operationCosts,
        
        materialCost: totalMaterialCost,
        operationsCost: totalOperationsCost,
        setupCosts: totalSetupCost,
        subtotal,
        
        markup,
        discountPercent,
        discountAmount,
        
        finalPrice: Math.round(finalPrice * 100) / 100,
        pricePerUnit: Math.round(pricePerUnit * 100) / 100
      };
    } catch (error: any) {
      logger.error('❌ FlexiblePricingService.calculatePrice: критическая ошибка', {
        productId,
        quantity,
        error: {
          message: error?.message,
          code: error?.code,
          errno: error?.errno,
          stack: error?.stack
        }
      });
      throw error;
    }
  }

  /**
   * Получает операции, связанные с продуктом
   */
  private static async getProductOperations(productId: number, configuration: any): Promise<any[]> {
    const db = await getDb();
    
    const cols = await getTableColumns('product_operations_link');
    const hasIsOptional = cols.has('is_optional');
    const hasLinkedParam = cols.has('linked_parameter_name');

    // Получаем все операции продукта с безопасным SELECT
    const operations = await db.all(`
      SELECT 
        pol.id as link_id,
        pol.sort_order,
        pol.is_required,
        ${hasIsOptional ? 'pol.is_optional' : '0 as is_optional'},
        ${hasLinkedParam ? 'pol.linked_parameter_name' : 'NULL as linked_parameter_name'},
        pol.default_params,
        pps.id,
        pps.name,
        pps.description,
        pps.price,
        pps.unit,
        pps.operation_type,
        pps.price_unit,
        pps.setup_cost,
        pps.min_quantity,
        pps.parameters
      FROM product_operations_link pol
      JOIN post_processing_services pps ON pol.operation_id = pps.id
      WHERE pol.product_id = ? AND pps.is_active = 1
      ORDER BY pol.sort_order
    `, [productId]);

    logger.info('📋 Загружены операции продукта', {
      productId,
      operationsCount: operations.length,
      operations: operations.map(op => ({
        id: op.id,
        name: op.name,
        operation_type: op.operation_type,
        price: op.price
      }))
    });

    // Получаем параметры продукта с их связанными операциями
    let parameters: any[] = [];
    try {
      parameters = await db.all(`
        SELECT * FROM product_parameters
        WHERE product_id = ? AND linked_operation_id IS NOT NULL
      `, [productId]);

      logger.info('📋 Загружены параметры с связанными операциями', { 
        parametersCount: parameters.length,
        parameters: parameters.map(p => ({ name: p.name, label: p.label, type: p.type, linked_op: p.linked_operation_id }))
      });
    } catch (paramError: any) {
      // Если таблица/колонка не существует - просто логируем и продолжаем без параметров
      if (paramError?.code === 'SQLITE_ERROR') {
        logger.warn('⚠️ Колонка linked_operation_id не существует, пропускаем загрузку связанных операций');
        parameters = [];
      } else {
        throw paramError;
      }
    }

    // Собираем ID операций, которые нужно добавить через параметры
    const additionalOperationIds = new Set<number>();
    const configParams = configuration.params || configuration;
    
    for (const param of parameters) {
      if (param.type === 'checkbox' && param.linked_operation_id) {
        const paramValue = configParams[param.name];
        logger.info('🔍 Проверка checkbox параметра', { 
          paramName: param.name, 
          paramValue, 
          linkedOpId: param.linked_operation_id 
        });
        
        // Если параметр включен (true, 'true', 1, '1') - добавляем операцию
        if (paramValue === true || paramValue === 'true' || paramValue === 1 || paramValue === '1') {
          additionalOperationIds.add(param.linked_operation_id);
          logger.info('✅ Добавляем операцию через параметр', { 
            paramName: param.name, 
            operationId: param.linked_operation_id 
          });
        }
      }
    }

    // Добавляем связанные операции
    let allOperations = [...operations];
    if (additionalOperationIds.size > 0) {
      try {
        const linkedOps = await db.all(`
          SELECT 
            pol.id as link_id,
            pol.sort_order,
            pol.is_required,
            ${hasIsOptional ? 'pol.is_optional' : '0 as is_optional'},
            pol.default_params,
            pps.id,
            pps.name,
            pps.description,
            pps.price,
            pps.unit,
            pps.operation_type,
            pps.price_unit,
            pps.setup_cost,
            pps.min_quantity,
            pps.parameters
          FROM product_operations_link pol
          JOIN post_processing_services pps ON pol.operation_id = pps.id
          WHERE pol.id IN (${[...additionalOperationIds].join(',')}) AND pps.is_active = 1
        `);
        
        // Добавляем к списку, избегая дубликатов
        for (const linkedOp of linkedOps) {
          if (!allOperations.find(op => op.link_id === linkedOp.link_id)) {
            allOperations.push(linkedOp);
          }
        }
        
        logger.info('➕ Добавлены опциональные операции через параметры', { 
          addedCount: linkedOps.length,
          operations: linkedOps.map(op => op.name)
        });
      } catch (linkError: any) {
        if (linkError?.code === 'SQLITE_ERROR') {
          logger.warn('⚠️ Ошибка загрузки связанных операций, пропускаем', { error: linkError.message });
        } else {
          throw linkError;
        }
      }
    }

    // Фильтруем операции по условиям (старая логика)
    const filteredOperations = allOperations.filter(op => {
      if (!op.conditions) return true; // Нет условий - всегда применяется
      
      try {
        const conditions = JSON.parse(op.conditions);
        return this.checkConditions(conditions, configuration);
      } catch (err) {
        logger.error('Ошибка парсинга условий операции', { operationId: op.id, err });
        return false;
      }
    });

    return filteredOperations;
  }

  /**
   * Проверяет условия применения операции
   */
  private static checkConditions(conditions: any, configuration: any): boolean {
    for (const key in conditions) {
      const conditionValue = conditions[key];
      const configValue = configuration.parameters?.[key];
      
      if (configValue !== conditionValue) {
        return false;
      }
    }
    return true;
  }

  /**
   * Рассчитывает стоимость одной операции
   */
  private static async calculateOperationCost(
    operation: any,
    configuration: any,
    quantity: number,
    sheetsNeeded: number,
    productSize: ProductSize,
    layout: LayoutResult,
    numberOfStacks: number,
    markupSettings: Record<string, number>
  ): Promise<OperationCostDetail> {
    const db = await getDb();
    
    // Определяем количество для расчета в зависимости от единицы измерения
    let effectiveQuantity = 1;
    
    switch (operation.price_unit) {
      case 'per_sheet':
        effectiveQuantity = sheetsNeeded;
        break;
      case 'per_item':
        effectiveQuantity = quantity;
        break;
      case 'per_m2':
        const areaSqM = (productSize.width / 1000) * (productSize.height / 1000);
        effectiveQuantity = quantity * areaSqM;
        break;
      case 'per_hour':
        // Для почасовой оплаты нужно рассчитывать время
        effectiveQuantity = Math.ceil(quantity / 100); // Примерно 100 изделий в час
        break;
      case 'per_cut':
      case 'за рез':
        // 🔪 Резка стопой: один рез проходит через всю стопу листов, поэтому считаем cutsPerSheet, а не cutsPerSheet × sheetsNeeded
        // 5 резов на лист × 10 листов = 5 резов всего (стопой), не 50
        effectiveQuantity = layout?.cutsPerSheet ?? 0;
        if (effectiveQuantity <= 0) effectiveQuantity = 1;

        logger.info('🔪 Расчет резки (стопой)', {
          cutsPerSheet: layout?.cutsPerSheet,
          sheetsNeeded,
          effectiveQuantity,
          layout: `${layout?.layout?.cols ?? 0}×${layout?.layout?.rows ?? 0}`
        });
        break;
      case 'fixed':
      case 'per_order':
        effectiveQuantity = 1;
        break;
      default:
        effectiveQuantity = quantity;
    }

    // ✅ Если операция - печать, ОБЯЗАТЕЛЬНО используем цены из таблицы принтеров
    // ⚠️ ВАЖНО: Цена операции печати из post_processing_services НЕ ИСПОЛЬЗУЕТСЯ!
    // Все цены печати берутся ТОЛЬКО из таблицы printers на основе технологии, цвета и двухсторонности
    // Проверяем, является ли операция операцией печати
    const operationNameLower = operation.name?.toLowerCase() || '';
    const isPrintOperation = operation.operation_type === 'print' || 
                               operationNameLower.includes('печать') ||
                               operationNameLower.includes('print');
    
    logger.info('🔍 Проверка операции на печать', {
      operationId: operation.id,
      operationName: operation.name,
      operationNameLower,
      operationType: operation.operation_type,
      isPrintOperation,
      checkResult: {
        byType: operation.operation_type === 'print',
        byNameRu: operationNameLower.includes('печать'),
        byNameEn: operationNameLower.includes('print')
      },
      hasPrintTechnology: !!configuration.print_technology,
      hasPrintColorMode: !!configuration.print_color_mode,
      printTechnology: configuration.print_technology,
      printColorMode: configuration.print_color_mode,
      sides: configuration.sides
    });
    
    // Объявляем unitPrice и pricingKey до использования в разных блоках
    let unitPrice: number;
    let pricingKey: string | undefined;
    
    if (isPrintOperation) {
      // Для операций печати ОБЯЗАТЕЛЬНО нужны параметры технологии и режима цвета
      if (!configuration.print_technology) {
        throw new Error(
          `❌ Ошибка расчета: для операции печати "${operation.name}" не указана технология печати (print_technology). ` +
          `Проверьте настройки продукта или параметры конфигурации.`
        );
      }
      
      if (!configuration.print_color_mode) {
        throw new Error(
          `❌ Ошибка расчета: для операции печати "${operation.name}" не указан режим цвета (print_color_mode). ` +
          `Должно быть 'bw' или 'color'.`
        );
      }

      const isDuplex = configuration.sides === 2 || configuration.sides === '2';
      const isColor = configuration.print_color_mode === 'color';
      const priceMode = ((isColor ? 'color' : 'bw') + '_' + (isDuplex ? 'duplex' : 'single')) as 'bw_single' | 'bw_duplex' | 'color_single' | 'color_duplex';

      let price: number | null = null;
      const priceRow = await PrintPriceService.getByTechnology(configuration.print_technology);

      if (priceRow?.counter_unit === 'meters') {
        const widthMeters = productSize.width / 1000;
        pricingKey = isColor ? 'price_color_per_meter' : 'price_bw_per_meter';
        const perMeter = isColor ? priceRow.price_color_per_meter : priceRow.price_bw_per_meter;
        price = perMeter ? perMeter * widthMeters : null;
        logger.info('🧾 Печать (meters): расчет unitPrice', {
          technologyCode: configuration.print_technology,
          pricingKey,
          perMeter,
          widthMeters,
          unitPriceComputed: price,
        });
      } else {
        const tierResult = await PrintPriceService.getPricePerSheetFromTiers(
          configuration.print_technology,
          priceMode,
          sheetsNeeded
        );
        if (tierResult && tierResult.pricePerSheet > 0) {
          price = tierResult.pricePerSheet;
          pricingKey = `tier_${priceMode}`;
        }
      }

      if (price === null || price <= 0) {
        throw new Error(
          `❌ Ошибка расчета: для технологии "${configuration.print_technology}" не найдены диапазоны цен (print_price_tiers) или они пусты. ` +
          `Добавьте диапазоны тиража в /adminpanel (print-prices) и повторите расчет.`
        );
      }

      unitPrice = price;
      logger.info('✅ Используем цену печати из централизованных диапазонов (print_price_tiers)', {
        operationId: operation.id,
        operationName: operation.name,
        technologyCode: configuration.print_technology,
        colorMode: configuration.print_color_mode,
        isDuplex,
        priceMode,
        pricingKey,
        unitPrice,
        sheetsNeeded,
        itemsPerSheet: layout?.itemsPerSheet,
        totalSheets: Math.ceil(quantity / (layout?.itemsPerSheet || 1))
      });
    } else {
      // Для не-печатных операций: проверяем цены вариантов (сложные операции — ламинация и т.п.)
      const variantId = this.getVariantIdForOperation(operation.id, configuration);
      if (variantId != null && Number.isFinite(variantId)) {
        try {
          const tiers = await PricingServiceRepository.listServiceTiers(operation.id, variantId);
          if (tiers && tiers.length > 0) {
            const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
            const tier = this.findTierForEffectiveQuantity(sorted, effectiveQuantity);
            if (tier && tier.rate > 0) {
              unitPrice = tier.rate * (operation.price_multiplier || 1.0) * (markupSettings.operation_price_multiplier || 1.0);
              pricingKey = `variant_${variantId}`;
              logger.info('✅ Используем цену варианта операции (сложная операция)', {
                operationId: operation.id,
                operationName: operation.name,
                variantId,
                tierRate: tier.rate,
                effectiveQuantity,
                unitPrice,
              });
            }
          }
        } catch (tierErr) {
          logger.warn('Не удалось загрузить тарифы варианта, используем базовую цену', {
            operationId: operation.id,
            variantId,
            error: (tierErr as Error)?.message,
          });
        }
      }
      if (unitPrice === undefined || unitPrice <= 0) {
        const operationMultiplier = markupSettings.operation_price_multiplier || 1.0;
        unitPrice = operation.price * (operation.price_multiplier || 1.0) * operationMultiplier;
        logger.info('ℹ️ Используем базовую цену операции (не печать)', {
          operationId: operation.id,
          operationName: operation.name,
          basePrice: operation.price,
          multiplier: operation.price_multiplier || 1.0,
          finalPrice: unitPrice,
          note: 'Операция не определена как печать. Проверьте operation_type="print" или добавьте "печать"/"print" в название.'
        });
      }
    }
    
    // Применяем правила ценообразования
    const appliedRules: string[] = [];
    const pricingRules = await db.all(`
      SELECT * FROM operation_pricing_rules 
      WHERE operation_id = ? AND is_active = 1
      ORDER BY id ASC
    `, [operation.id]);

    for (const rule of pricingRules) {
      try {
        const conditions = JSON.parse(rule.conditions);
        const pricingData = JSON.parse(rule.pricing_data);
        
        if (this.checkPricingRuleConditions(conditions, { quantity, sheetsNeeded, configuration })) {
          unitPrice = await this.applyPricingRule(unitPrice, rule.rule_type, pricingData, markupSettings);
          appliedRules.push(rule.rule_name);
        }
      } catch (err) {
        logger.error('Ошибка применения правила ценообразования', { ruleId: rule.id, err });
      }
    }

    // ✅ ИСПРАВЛЕНО: Для операций печати цена рассчитывается за листы, а не за изделия
    const totalCost = isPrintOperation ? unitPrice * sheetsNeeded : unitPrice * effectiveQuantity;
    const setupCost = operation.setup_cost || 0;

    logger.info('💰 Расчет стоимости операции', {
      operationId: operation.id,
      operationName: operation.name,
      operationType: operation.operation_type,
      isPrintOperation,
      unitPrice,
      quantity: isPrintOperation ? sheetsNeeded : effectiveQuantity,
      effectiveQuantity,
      sheetsNeeded,
      totalCost
    });

    return {
      operationId: operation.id,
      operationName: operation.name,
      operationType: operation.operation_type,
      priceUnit: operation.price_unit,
      unitPrice,
      quantity: isPrintOperation ? sheetsNeeded : effectiveQuantity,
      setupCost,
      totalCost: Math.round(totalCost * 100) / 100,
      appliedRules: appliedRules.length > 0 ? appliedRules : undefined,
      pricingSource: isPrintOperation ? 'print_prices' : 'operation_base',
      pricingKey: isPrintOperation ? (pricingKey ?? undefined) : undefined,
      technologyCode: isPrintOperation ? configuration.print_technology : undefined,
    };
  }

  /**
   * Извлекает variant_id для операции из конфигурации (finishing или selectedOperations)
   */
  private static getVariantIdForOperation(operationId: number, configuration: any): number | undefined {
    const finishing = configuration?.finishing;
    if (Array.isArray(finishing)) {
      const entry = finishing.find((f: any) => Number(f?.service_id) === operationId);
      const vid = entry?.variant_id;
      if (vid != null && Number.isFinite(Number(vid))) return Number(vid);
    }
    const selected = configuration?.selectedOperations;
    if (Array.isArray(selected)) {
      const entry = selected.find((s: any) => Number(s?.operationId) === operationId);
      const vid = entry?.variantId ?? entry?.variant_id;
      if (vid != null && Number.isFinite(Number(vid))) return Number(vid);
    }
    return undefined;
  }

  /**
   * Находит подходящий тариф по количеству (аналогично SimplifiedPricingService.findTierForQuantity)
   */
  private static findTierForEffectiveQuantity(
    tiers: Array<{ minQuantity: number; rate: number }>,
    quantity: number
  ): { minQuantity: number; rate: number } | null {
    if (!tiers || tiers.length === 0) return null;
    const sorted = [...tiers].sort((a, b) => b.minQuantity - a.minQuantity);
    for (const tier of sorted) {
      if (quantity >= tier.minQuantity) return tier;
    }
    return tiers[0] ?? null;
  }

  /**
   * Проверяет условия правила ценообразования
   */
  private static checkPricingRuleConditions(conditions: any, context: any): boolean {
    if (conditions.min_quantity && context.quantity < conditions.min_quantity) return false;
    if (conditions.max_quantity && context.quantity > conditions.max_quantity) return false;
    if (conditions.min_sheets && context.sheetsNeeded < conditions.min_sheets) return false;
    if (conditions.is_rush && !context.configuration.parameters?.rush) return false;
    
    return true;
  }

  /**
   * Применяет правило ценообразования
   */
  private static async applyPricingRule(basePrice: number, ruleType: string, pricingData: any, markupSettings: Record<string, number>): Promise<number> {
    switch (ruleType) {
      case 'quantity_discount':
        const discountPercent = pricingData.discount_percent || 0;
        return basePrice * (1 - discountPercent / 100);
      
      case 'rush':
        const rushMultiplier = markupSettings.rush_multiplier || 1.5;
        return basePrice * rushMultiplier;

      case 'size_based':
        return pricingData.price_per_m2 || basePrice;

      case 'material_based':
        // Сложная логика, пока возвращаем базовую цену
        return basePrice;

      case 'complexity':
        const complexityMultiplier = markupSettings.complexity_multiplier || 1.0;
        return basePrice * complexityMultiplier;
      
      default:
        return basePrice;
    }
  }

  /**
   * Рассчитывает стоимость материалов
   */
  private static async calculateMaterialCosts(
    product: any,
    productSize: ProductSize,
    layout: LayoutResult,
    configuration: any,
    quantity: number,
    sheetsNeeded: number
  ): Promise<MaterialCostDetail[]> {
    try {
      const db = await getDb();

      // 🎯 ПРИОРИТЕТ 1: Если в конфигурации указан конкретный material_id - используем только его
      if (configuration.material_id) {
        logger.info('🎯 Используем материал из конфигурации', { materialId: configuration.material_id });
        const selectedMaterial = await db.get<{
          id: number;
          name: string;
          sheet_price_single: number | null;
          unit: string;
          category_name: string | null;
        }>(
          `SELECT m.id, m.name, m.sheet_price_single, m.unit, c.name as category_name
           FROM materials m
           LEFT JOIN material_categories c ON c.id = m.category_id
           WHERE m.id = ?`,
          [configuration.material_id]
        );
        
        if (selectedMaterial) {
          const unitPrice = selectedMaterial.sheet_price_single || 0;
          const isRollPaper = selectedMaterial.category_name === ROLL_PAPER_CATEGORY_NAME;
          const roundedQty = Math.max(0, Math.ceil(isRollPaper ? quantity : sheetsNeeded));
          const totalCost = Math.round(roundedQty * unitPrice * 100) / 100;
          
          return [{
            materialId: selectedMaterial.id,
            materialName: selectedMaterial.name,
            quantity: roundedQty,
            unitPrice,
            totalCost
          }];
        }
      }

      // 🎯 ПРИОРИТЕТ 2: Материалы из product_materials (назначенные через UI)
      logger.info('📦 Получаем материалы продукта из product_materials', { productId: product.id });
      type ProductMaterialRow = {
        material_id: number;
        qty_per_sheet: number;
        is_required: number;
        material_name: string;
        unit: string;
        sheet_price_single: number | null;
        category_name: string | null;
      };
      const productMaterials = (await db.all<ProductMaterialRow>(
        `SELECT 
          pm.material_id,
          pm.qty_per_sheet,
          pm.is_required,
          m.name as material_name,
          m.unit,
          m.sheet_price_single,
          c.name as category_name
         FROM product_materials pm
         JOIN materials m ON m.id = pm.material_id
         LEFT JOIN material_categories c ON c.id = m.category_id
         WHERE pm.product_id = ?
         ORDER BY pm.is_required DESC, m.name`,
        [product.id]
      )) as unknown as ProductMaterialRow[];

      if (productMaterials.length > 0) {
        logger.info('✅ Используем материалы из product_materials', {
          count: productMaterials.length,
          materials: productMaterials.map(m => ({
            name: m.material_name,
            qty_per_sheet: m.qty_per_sheet,
            sheet_price_single: m.sheet_price_single,
            unit: m.unit,
            category_name: m.category_name
          }))
        });
        const costs: MaterialCostDetail[] = [];
        
        for (const material of productMaterials) {
          const unitPrice = material.sheet_price_single || 0;
          const isRollPaper = material.category_name === ROLL_PAPER_CATEGORY_NAME;
          const calculatedQty = isRollPaper
            ? material.qty_per_sheet * quantity
            : material.qty_per_sheet * sheetsNeeded;
          const roundedQty = Math.max(0, Math.ceil(calculatedQty));
          const totalCost = Math.round(roundedQty * unitPrice * 100) / 100;
          
          costs.push({
            materialId: material.material_id,
            materialName: material.material_name,
            quantity: roundedQty,
            unitPrice,
            totalCost
          });
        }

        logger.info('📦 Финальный расчет материалов', {
          sheetsNeeded,
          costs: costs.map(c => ({
            name: c.materialName,
            quantity: c.quantity,
            unitPrice: c.unitPrice,
            totalCost: c.totalCost
          }))
        });

        return costs;
      }

      // 🎯 ПРИОРИТЕТ 3: Правила материалов из product_material_rules
      logger.info('📦 Получаем правила материалов из product_material_rules', { productId: product.id });
      const materialRules = await this.fetchMaterialRules(product);
      logger.info('✅ Правила материалов получены', { rulesCount: materialRules.length });

      logger.info('🔍 Получаем материалы из шаблона', { productId: product.id });
      const templateMaterialIds = await this.getTemplateMaterialIds(product.id);
      logger.info('✅ Материалы из шаблона получены', { templateMaterialIdsCount: templateMaterialIds.length });

      const costs: MaterialCostDetail[] = [];
      const usedMaterialIds = new Set<number>();
      const areaPerItem = Math.max(
        0,
        (Number(productSize.width) || 0) / 1000 * ((Number(productSize.height) || 0) / 1000)
      );

      for (const rule of materialRules) {
      const unitPrice = rule.sheet_price_single || 0;
      const isRollPaper = rule.category_name === ROLL_PAPER_CATEGORY_NAME;
      let calculatedQty = 0;

      switch (rule.calculation_type) {
        case 'per_item':
          calculatedQty = rule.qty_per_item * quantity;
          break;
        case 'per_sheet':
          calculatedQty = isRollPaper ? rule.qty_per_item * quantity : rule.qty_per_item * sheetsNeeded;
          break;
        case 'per_sqm':
          calculatedQty = rule.qty_per_item * quantity * (areaPerItem || 1);
          break;
        case 'fixed':
          calculatedQty = rule.qty_per_item;
          break;
        default:
          calculatedQty = rule.qty_per_item * quantity;
      }

      const roundedQty = Math.max(0, Math.ceil(calculatedQty));
      const totalCost = Math.round(roundedQty * unitPrice * 100) / 100;

      costs.push({
        materialId: rule.material_id,
        materialName: rule.material_name,
        quantity: roundedQty,
        unitPrice,
        totalCost
      });

      usedMaterialIds.add(rule.material_id);
    }

    const remainingTemplateIds = templateMaterialIds.filter((id) => !usedMaterialIds.has(id));

    if (remainingTemplateIds.length) {
      const placeholders = remainingTemplateIds.map(() => '?').join(',');
      type TemplateMaterialRow = {
        id: number;
        name: string;
        sheet_price_single: number | null;
        unit: string;
        category_name: string | null;
      };
      const templateMaterials = (await db.all<TemplateMaterialRow>(
        `SELECT m.id, m.name, m.sheet_price_single, m.unit, c.name as category_name
         FROM materials m
         LEFT JOIN material_categories c ON c.id = m.category_id
         WHERE m.id IN (${placeholders})`,
        remainingTemplateIds
      )) as unknown as TemplateMaterialRow[];

      for (const material of templateMaterials) {
        const unitPrice = material.sheet_price_single || 0;
        const isRollPaper = material.category_name === ROLL_PAPER_CATEGORY_NAME;
        const baseQty = isRollPaper
          ? quantity
          : (sheetsNeeded || Math.ceil(quantity / Math.max(layout.itemsPerSheet, 1)));
        const roundedQty = Math.max(0, Math.ceil(baseQty));
        const totalCost = Math.round(roundedQty * unitPrice * 100) / 100;

        costs.push({
          materialId: material.id,
          materialName: material.name,
          quantity: roundedQty,
          unitPrice,
          totalCost
        });

        usedMaterialIds.add(material.id);
      }
    }

    if (!costs.length) {
      type FallbackMaterialRow = {
        id: number;
        name: string;
        sheet_price_single: number | null;
        unit: string;
        category_name: string | null;
      };
      const fallbackMaterials = (await db.all<FallbackMaterialRow>(`
        SELECT 
          m.id,
          m.name,
          m.sheet_price_single,
          m.unit,
          c.name as category_name
        FROM materials m
        LEFT JOIN material_categories c ON c.id = m.category_id
        WHERE m.quantity > 0
        ORDER BY m.name
        LIMIT 5
      `)) as unknown as FallbackMaterialRow[];

      for (const material of fallbackMaterials) {
        const unitPrice = material.sheet_price_single || 0;
        const isRollPaper = material.category_name === ROLL_PAPER_CATEGORY_NAME;
        const roundedQty = Math.max(0, Math.ceil(isRollPaper ? quantity : (sheetsNeeded || quantity)));
        const totalCost = Math.round(roundedQty * unitPrice * 100) / 100;

        costs.push({
          materialId: material.id,
          materialName: material.name,
          quantity: roundedQty,
          unitPrice,
          totalCost
        });
      }
    }

      return costs;
    } catch (error: any) {
      logger.error('❌ Ошибка в calculateMaterialCosts', {
        productId: product?.id,
        error: {
          message: error?.message,
          code: error?.code,
          errno: error?.errno,
          stack: error?.stack
        }
      });
      // Возвращаем пустой массив, чтобы расчет мог продолжиться
      return [];
    }
  }

  private static async fetchMaterialRules(product: any): Promise<Array<any>> {
    const presetKey = this.resolvePresetKey(product);
    if (!presetKey) {
      return [];
    }

    const db = await getDb();

    const paramsByName = [presetKey, product?.name ?? null];
    let rules = await db.all(
      `SELECT 
         pmr.material_id,
         pmr.qty_per_item,
         pmr.calculation_type,
         pmr.is_required,
         m.name as material_name,
         m.unit,
         m.sheet_price_single,
         c.name as category_name
       FROM product_material_rules pmr
       JOIN materials m ON m.id = pmr.material_id
       LEFT JOIN material_categories c ON c.id = m.category_id
       WHERE pmr.product_type = ? AND pmr.product_name = ?
       ORDER BY pmr.is_required DESC, m.name`,
      paramsByName
    );

    if (!rules.length) {
      rules = await db.all(
        `SELECT 
           pmr.material_id,
           pmr.qty_per_item,
           pmr.calculation_type,
           pmr.is_required,
           m.name as material_name,
           m.unit,
           m.sheet_price_single,
           c.name as category_name
         FROM product_material_rules pmr
         JOIN materials m ON m.id = pmr.material_id
         LEFT JOIN material_categories c ON c.id = m.category_id
         WHERE pmr.product_type = ? AND (pmr.product_name IS NULL OR pmr.product_name = '' OR pmr.product_name = 'Универсальный')
         ORDER BY pmr.is_required DESC, m.name`,
        [presetKey]
      );
    }

    return rules;
  }

  private static resolvePresetKey(product: any): string | null {
    const candidates = [
      product?.parameter_preset_key,
      product?.operation_preset,
      product?.product_type,
      product?.calculator_type,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    const category = (product?.category_name || '').toLowerCase();
    if (category.includes('визит')) return 'business_cards';
    if (category.includes('листов')) return 'flyers';
    if (category.includes('буклет')) return 'booklets';
    if (category.includes('плакат')) return 'posters';
    if (category.includes('футбол')) return 'tshirt';

    return null;
  }

  private static async getTemplateMaterialIds(productId: number): Promise<number[]> {
    try {
      logger.info('🔎 getTemplateMaterialIds: начало запроса', { productId });
      const db = await getDb();
      const row = await db.get(
        `SELECT config_data, constraints
           FROM product_template_configs
          WHERE product_id = ? AND name = 'template'
          ORDER BY id DESC
          LIMIT 1`,
        [productId]
      );
      logger.info('🔎 getTemplateMaterialIds: результат запроса', { productId, hasRow: !!row, row });

      const ids = new Set<number>();

      if (row?.config_data) {
        try {
          const configData = JSON.parse(row.config_data);
          const include = configData?.material_include_ids;
          if (Array.isArray(include)) {
            include.forEach((id: any) => {
              if (Number.isFinite(Number(id))) {
                ids.add(Number(id));
              }
            });
          }
        } catch (error) {
          logger.warn('Не удалось разобрать config_data для материалов', { productId, error });
        }
      }

      if (row?.constraints) {
        try {
          const constraints = JSON.parse(row.constraints);
          const include = constraints?.overrides?.include_ids;
          if (Array.isArray(include)) {
            include.forEach((id: any) => {
              if (Number.isFinite(Number(id))) {
                ids.add(Number(id));
              }
            });
          }
        } catch (error) {
          logger.warn('Не удалось разобрать constraints для материалов', { productId, error });
        }
      }

      logger.info('🔎 getTemplateMaterialIds: завершено', { productId, idsCount: ids.size });
      return Array.from(ids);
    } catch (error: any) {
      logger.error('❌ getTemplateMaterialIds: критическая ошибка', {
        productId,
        error: {
          message: error?.message,
          code: error?.code,
          errno: error?.errno,
          sql: error?.sql,
          stack: error?.stack
        }
      });
      // Возвращаем пустой массив
      return [];
    }
  }

  /**
   * Извлекает размеры продукта из конфигурации
   */
  private static extractProductSize(configuration: any): ProductSize {
    // Приоритет 1: trim_size (из шаблона продукта или конфигурации)
    if (configuration.trim_size) {
      const width = configuration.trim_size.width;
      const height = configuration.trim_size.height;
      if (width != null && height != null && width > 0 && height > 0) {
        const result = { width: Number(width), height: Number(height) };
        logger.debug('✅ Используем trim_size из конфигурации', { trim_size: configuration.trim_size, result });
        return result;
      }
    }
    
    // Приоритет 2: parameters (старый формат)
    const width = configuration.parameters?.width || configuration.parameters?.размер_ширина;
    const height = configuration.parameters?.height || configuration.parameters?.размер_высота;
    
    if (width != null && height != null && width > 0 && height > 0) {
      const result = { width: Number(width), height: Number(height) };
      logger.debug('✅ Используем размеры из parameters', { width, height, result });
      return result;
    }
    
    // ⚠️ КРИТИЧЕСКАЯ ОШИБКА: размеры не найдены!
    // Не используем дефолтные значения, так как это приводит к неправильным расчетам
    logger.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Размеры продукта не найдены!', {
      configuration: JSON.stringify(configuration).substring(0, 500),
      hasTrimSize: !!configuration.trim_size,
      hasParameters: !!configuration.parameters
    });
    
    // Выбрасываем ошибку вместо использования дефолтных значений
    throw new Error('Размеры продукта не найдены. Убедитесь, что в шаблоне продукта задан trim_size или передайте размеры в конфигурации.');
  }

  /**
   * Получает базовую наценку из БД
   */
  private static async getBaseMarkup(): Promise<number> {
    const db = await getDb();

    const markup = await db.get(`
      SELECT setting_value FROM markup_settings
      WHERE setting_name = 'base_markup' AND is_active = 1
    `);

    return markup?.setting_value || 2.2;
  }

  /**
   * Получает множитель для срочных заказов из БД
   */
  private static async getRushMultiplier(): Promise<number> {
    const db = await getDb();

    const setting = await db.get(`
      SELECT setting_value FROM markup_settings
      WHERE setting_name = 'rush_multiplier' AND is_active = 1
    `);

    return setting?.setting_value || 1.5;
  }

  /**
   * Получает множитель за сложность из БД
   */
  private static async getComplexityMultiplier(): Promise<number> {
    const db = await getDb();

    const setting = await db.get(`
      SELECT setting_value FROM markup_settings
      WHERE setting_name = 'complexity_multiplier' AND is_active = 1
    `);

    return setting?.setting_value || 1.0;
  }

  /**
   * Получает базовый множитель цены операций из БД
   */
  private static async getOperationPriceMultiplier(): Promise<number> {
    const db = await getDb();

    const setting = await db.get(`
      SELECT setting_value FROM markup_settings
      WHERE setting_name = 'operation_price_multiplier' AND is_active = 1
    `);

    return setting?.setting_value || 1.0;
  }

  /**
   * Получает все настройки наценок из БД
   */
  private static async getAllMarkupSettings(): Promise<Record<string, number>> {
    const db = await getDb();

    const settings = await db.all(`
      SELECT setting_name, setting_value FROM markup_settings
      WHERE is_active = 1
    `);

    const result: Record<string, number> = {};
    settings.forEach((setting: any) => {
      result[setting.setting_name] = setting.setting_value;
    });

    // Устанавливаем дефолтные значения если не найдены в БД
    result.base_markup = result.base_markup || 2.2;
    result.rush_multiplier = result.rush_multiplier || 1.5;
    result.complexity_multiplier = result.complexity_multiplier || 1.0;
    result.operation_price_multiplier = result.operation_price_multiplier || 1.0;

    return result;
  }

  /**
   * Получает скидку за тираж из БД
   */
  private static async getQuantityDiscount(
    sheetsCount: number,
    itemsCount: number,
    productType?: string,
    sheetFormat?: 'SRA3'
  ): Promise<number> {
    const db = await getDb();

    // Для листовых продуктов скидки применяем как "скидки за объём печати" по количеству листов (например SRA3)
    if (this.isSheetBasedProduct(productType)) {
      if (sheetFormat !== 'SRA3') return 0;
      const discount = await db.get(`
        SELECT discount_percent FROM quantity_discounts
        WHERE min_quantity <= ?
          AND (max_quantity IS NULL OR max_quantity >= ?)
          AND is_active = 1
        ORDER BY min_quantity DESC
        LIMIT 1
      `, [sheetsCount, sheetsCount]);
      return discount?.discount_percent || 0;
    }

    // Для многостраничных и других продуктов скидки применяются по количеству изделий/экземпляров
    const discount = await db.get(`
      SELECT discount_percent FROM quantity_discounts
      WHERE min_quantity <= ?
        AND (max_quantity IS NULL OR max_quantity >= ?)
        AND is_active = 1
      ORDER BY min_quantity DESC
      LIMIT 1
    `, [itemsCount, itemsCount]);

    return discount?.discount_percent || 0;
  }

  private static isSheetBasedProduct(productType?: string): boolean {
    const sheetProducts = ['business_cards', 'flyers', 'stickers'];
    return productType ? sheetProducts.includes(productType) : false;
  }

  private static isMultiPageProduct(productType?: string): boolean {
    const multiPageProducts = ['multi_page', 'booklets'];
    return productType ? multiPageProducts.includes(productType) : false;
  }

  private static mapNameToProductType(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    // Приводим к нижнему регистру, но сохраняем оригинальную кодировку
    const lower = value.toLowerCase();

    // Карточные продукты
    if (lower.includes('визит') || lower.includes('бейдж') || lower.includes('карт')) {
      return 'business_cards';
    }

    // Многостраничные продукты - проверяем несколько вариантов из-за проблем с кодировкой
    if (lower.includes('буклет') || lower.includes('букле') || lower.includes('каталог') ||
        lower.includes('журнал') || lower.includes('книг') ||
        lower.includes('брошюр') || lower.includes('календар') ||
        lower.includes('тетрад') || lower.includes('блокнот') ||
        lower.includes('меню')) {
      return 'multi_page';
    }

    // Также проверяем по ID продукта (для кодированных названий)
    // Проверяем оригинальное значение без toLowerCase
    if (value.includes('буклет') || value.includes('букле') ||
        value.includes('буклет') || value.includes('букле')) {
      return 'multi_page';
    }

    // Листовые продукты
    if (lower.includes('листов') || lower.includes('флаер') ||
        lower.includes('открыт') || lower.includes('пригла') ||
        lower.includes('плакат') || lower.includes('афиш')) {
      return 'sheet_single';
    }

    return 'universal';
  }
}

