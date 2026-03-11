/**
 * 🎯 Упрощённый калькулятор цен
 * 
 * Используется для продуктов с calculator_type='simplified'
 * Рассчитывает цены напрямую из config_data.simplified без FlexiblePricingService
 */

import { getDb } from '../../../db';
import { getTableColumns } from '../../../utils/tableSchemaCache';
import { logger } from '../../../utils/logger';
import { PricingServiceRepository } from '../repositories/serviceRepository';
import { LayoutCalculationService } from './layoutCalculationService';
import { PrintPriceService } from './printPriceService';
import { PriceTypeService } from './priceTypeService';

export interface SimplifiedPricingResult {
  productId: number;
  productName: string;
  quantity: number;
  
  // Выбранная конфигурация
  selectedSize?: {
    id: number | string;
    label: string;
    width_mm: number;
    height_mm: number;
  };
  selectedPrint?: {
    technology_code: string;
    color_mode: 'color' | 'bw';
    sides_mode: 'single' | 'duplex' | 'duplex_bw_back';
  };
  selectedMaterial?: {
    material_id: number;
    material_name: string;
    density?: number; // 🆕 Плотность материала
    paper_type_name?: string; // 🆕 display_name типа бумаги для установки materialType на фронтенде
  };
  /** Материал-основа (заготовка): футболка, кружка — 1 шт на изделие */
  selectedBaseMaterial?: {
    material_id: number;
    material_name: string;
  };
  selectedFinishing?: Array<{
    service_id: number;
    service_name: string;
    price_unit: 'per_cut' | 'per_item';
    units_per_item: number;
  }>;
  
  // Стоимость по компонентам
  printPrice: number;
  materialPrice: number;
  finishingPrice: number;
  subtotal: number;
  finalPrice: number;
  pricePerUnit: number;
  
  // Детализация
  printDetails?: {
    tier: { min_qty: number; max_qty?: number; price: number };
    priceForQuantity: number;
  };
  materialDetails?: {
    tier: { min_qty: number; max_qty?: number; price: number };
    priceForQuantity: number;
  };
  /** Детали материала-основы (заготовка) — 1 шт на изделие */
  baseMaterialDetails?: {
    tier: { min_qty: number; max_qty?: number; price: number };
    priceForQuantity: number;
  };
  finishingDetails?: Array<{
    service_id: number;
    service_name: string;
    tier: { min_qty: number; max_qty?: number; price: number };
    units_needed: number;
    priceForQuantity: number;
    price_unit?: string;
    operation_type?: string;
  }>;
  
  calculatedAt: string;
  calculationMethod: 'simplified';
  /** Цены за единицу по диапазонам тиража для выбранной конфигурации (от min_qty шт) */
  tier_prices?: Array<{ min_qty: number; max_qty?: number; unit_price: number; total_price?: number }>;
  /** Проверка вместимости формата на печатный лист (SRA3/A3/A4); sheetsNeeded — листов к списанию */
  layout?: {
    fitsOnSheet: boolean;
    itemsPerSheet: number;
    sheetsNeeded: number;
    /** Для рулонной печати: пог. м к списанию */
    metersNeeded?: number;
    wastePercentage?: number;
    recommendedSheetSize?: { width: number; height: number };
  };
  warnings?: string[];
}

interface SimplifiedQtyTier {
  min_qty: number;
  max_qty?: number;
  unit_price: number; // цена за 1 ед. для этого диапазона
  // Обратная совместимость - если unit_price нет, но есть price или tier_prices
  price?: number;
  tier_prices?: number[];
}

interface SimplifiedSizeConfig {
  id: number | string;
  label: string;
  width_mm: number;
  height_mm: number;
  min_qty?: number;
  max_qty?: number;
  allowed_material_ids?: number[];
  /** Материалы-основы (заготовки): футболки, кружки — расход 1 шт на изделие */
  allowed_base_material_ids?: number[];
  print_prices: Array<{
    technology_code: string;
    color_mode: 'color' | 'bw';
    sides_mode: 'single' | 'duplex' | 'duplex_bw_back';
    tiers: SimplifiedQtyTier[];
  }>;
  material_prices: Array<{
    material_id: number;
    tiers: SimplifiedQtyTier[];
  }>;
  finishing: Array<{
    service_id: number;
    price_unit: 'per_cut' | 'per_item';
    units_per_item: number;
    variant_id?: number; // 🆕 ID варианта для услуг с вариантами (например, ламинация)
    // ✅ tiers больше не храним в шаблоне - цены берутся из централизованной системы услуг
    // tiers оставлен только для обратной совместимости со старыми данными
    tiers?: SimplifiedQtyTier[]; // Опционально, только для чтения старых данных
  }>;
}

interface SimplifiedConfig {
  sizes: SimplifiedSizeConfig[];
  /** Учитывать раскладку на лист: false = 1 изделие на лист */
  use_layout?: boolean;
  /** Для duplex/duplex_bw_back: считать печать как single ×2 (материалы не удваиваются) */
  duplex_as_single_x2?: boolean;
  /** Учитывать стоимость материалов: false = materialPrice = 0 */
  include_material_cost?: boolean;
}

export class SimplifiedPricingService {
  /**
   * Рассчитывает цену для упрощённого калькулятора
   */
  static async calculatePrice(
    productId: number,
    configuration: {
      size_id?: number | string;
      trim_size?: { width: number; height: number };
      print_technology?: string;
      print_color_mode?: 'color' | 'bw';
      print_sides_mode?: 'single' | 'duplex' | 'duplex_bw_back';
      material_id?: number;
      /** Материал-основа (заготовка): футболка, кружка — 1 шт на изделие */
      base_material_id?: number;
      finishing?: Array<{
        service_id: number;
        price_unit?: 'per_cut' | 'per_item';
        units_per_item?: number;
      }>;
    },
    quantity: number
  ): Promise<SimplifiedPricingResult> {
    const db = await getDb();
    
    // 1. Получаем продукт
    const product = await db.get<{ id: number; name: string; calculator_type: string; product_type?: string | null }>(
      `SELECT id, name, calculator_type, product_type FROM products WHERE id = ?`,
      [productId]
    );
    
    if (!product) {
      throw new Error('Product not found');
    }
    
    if (product.calculator_type !== 'simplified') {
      throw new Error(`Product calculator_type is not 'simplified', got: ${product.calculator_type}`);
    }
    
    // 2. Загружаем config_data.simplified из product_template_configs
    const templateConfig = await db.get<{ config_data: string }>(
      `SELECT config_data FROM product_template_configs 
       WHERE product_id = ? AND name = 'template' AND is_active = 1
       ORDER BY id DESC LIMIT 1`,
      [productId]
    );
    
    if (!templateConfig?.config_data) {
      throw new Error('Simplified config not found for product. Please configure product template first.');
    }
    
    const configData = typeof templateConfig.config_data === 'string'
      ? JSON.parse(templateConfig.config_data)
      : templateConfig.config_data;
    
    const simplifiedConfig: SimplifiedConfig = configData.simplified || { sizes: [] };
    
    // Для продуктов с типами (typeConfigs) размеры берём из typeConfigs[typeId].sizes
    const typeId = (configuration as any).typeId ?? (configuration as any).type_id;
    const typeConfigs = (configData.simplified as any)?.typeConfigs;
    let sizesToUse: SimplifiedSizeConfig[] = simplifiedConfig.sizes ?? [];
    
    if (typeId && typeConfigs?.[typeId]?.sizes?.length) {
      sizesToUse = typeConfigs[typeId].sizes;
      logger.info('Используем размеры из typeConfigs', { typeId, sizesCount: sizesToUse.length });
    } else if (typeConfigs && Object.keys(typeConfigs).length > 0) {
      // Продукт с подтипами (typeConfigs), но type_id не передан
      const err: any = new Error(
        'Для продукта с подтипами необходимо передать type_id (или typeId) в configuration. ' +
        'Получите список подтипов из GET /api/products/:productId/schema (simplified.types) и передайте id выбранного подтипа.'
      );
      err.status = 400;
      throw err;
    }
    
    if (!sizesToUse || sizesToUse.length === 0) {
      const err: any = new Error('No sizes configured in simplified config');
      err.status = 400;
      throw err;
    }
    
    // 2.5. Нормализуем конфигурацию: преобразуем sides в print_sides_mode и находим material_id
    let normalizedConfig = { ...configuration };
    
    // Преобразуем sides (1 или 2) в print_sides_mode
    if (!normalizedConfig.print_sides_mode && (configuration as any).sides) {
      const sides = (configuration as any).sides;
      if (sides === 1) {
        normalizedConfig.print_sides_mode = 'single';
      } else if (sides === 2) {
        normalizedConfig.print_sides_mode = 'duplex';
      }
      logger.info('Нормализация: sides -> print_sides_mode', {
        sides,
        print_sides_mode: normalizedConfig.print_sides_mode
      });
    }
    
    // Находим material_id по paperType и paperDensity, если material_id не указан
    if (!normalizedConfig.material_id && (configuration as any).paperType && (configuration as any).paperDensity) {
      try {
        const paperTypeName = String((configuration as any).paperType); // paperType - это name (строка), не ID
        const paperDensity = Number((configuration as any).paperDensity);
        
        // 1. Находим тип бумаги в таблице paper_types по name
        const paperType = await db.get<{ id: number; name: string }>(
          `SELECT id, name FROM paper_types WHERE name = ? AND is_active = 1`,
          [paperTypeName]
        );
        
        if (paperType) {
          // 2. Находим материал в таблице materials по paper_type_id и density
          const material = await db.get<{ id: number; name: string; density: number }>(
            `SELECT id, name, density FROM materials WHERE paper_type_id = ? AND density = ? AND is_active = 1 LIMIT 1`,
            [paperType.id, paperDensity]
          );
          
          if (material) {
            normalizedConfig.material_id = material.id;
            logger.info('Нормализация: найдено material_id по paperType и paperDensity', {
              paperType: paperTypeName,
              paperTypeId: paperType.id,
              paperDensity,
              material_id: normalizedConfig.material_id,
              material_name: material.name
            });
          } else {
            logger.warn('Материал не найден по типу бумаги и плотности', {
              paperType: paperTypeName,
              paperTypeId: paperType.id,
              paperDensity
            });
          }
        } else {
          logger.warn('Тип бумаги не найден', { paperType: paperTypeName });
        }
      } catch (error) {
        logger.error('Ошибка при поиске material_id', { error, paperType: (configuration as any).paperType, paperDensity: (configuration as any).paperDensity });
      }
    }
    
    // 3. Находим выбранный размер
    let selectedSize: SimplifiedSizeConfig | null = null;
    
    if (normalizedConfig.size_id) {
      selectedSize = sizesToUse.find(s => String(s.id) === String(normalizedConfig.size_id)) || null;
    } else if (normalizedConfig.trim_size) {
      // Ищем по размерам (примерное совпадение с допуском ±1мм)
      selectedSize = sizesToUse.find(s => 
        Math.abs(s.width_mm - normalizedConfig.trim_size!.width) <= 1 &&
        Math.abs(s.height_mm - normalizedConfig.trim_size!.height) <= 1
      ) || null;
    }
    
    if (!selectedSize) {
      const err: any = new Error(
        `Selected size not found in simplified config. size_id=${normalizedConfig.size_id ?? 'не указан'}, trim_size=${normalizedConfig.trim_size ? JSON.stringify(normalizedConfig.trim_size) : 'не указан'}. ` +
        'Проверьте, что size_id соответствует одному из размеров в схеме продукта (typeConfigs[typeId].sizes или simplified.sizes).'
      );
      err.status = 400;
      throw err;
    }

    const productSize = { width: selectedSize.width_mm, height: selectedSize.height_mm };

    // Учёт раскладки: use_layout=false → 1 изделие на лист (без оптимизации, для крупноформатных и т.п.)
    const useLayout = simplifiedConfig.use_layout !== false;
    let layoutCheck: { fitsOnSheet: boolean; itemsPerSheet: number; wastePercentage: number; recommendedSheetSize: { width: number; height: number }; layout: { rows: number; cols: number; actualItemsPerSheet: number }; cutsPerSheet: number };
    if (!useLayout) {
      layoutCheck = {
        fitsOnSheet: true,
        itemsPerSheet: 1,
        wastePercentage: 0,
        recommendedSheetSize: { width: productSize.width, height: productSize.height },
        layout: { rows: 1, cols: 1, actualItemsPerSheet: 1 },
        cutsPerSheet: 4,
      };
      logger.info('Раскладка отключена (use_layout=false): 1 изделие на лист', { productId });
    } else if (normalizedConfig.material_id) {
      const materialSheet = await db.get<{ sheet_width: number | null; sheet_height: number | null }>(
        `SELECT sheet_width, sheet_height FROM materials WHERE id = ?`,
        [normalizedConfig.material_id]
      );
      const mw = materialSheet?.sheet_width != null && materialSheet.sheet_width > 0 ? Number(materialSheet.sheet_width) : 0;
      const mh = materialSheet?.sheet_height != null && materialSheet.sheet_height > 0 ? Number(materialSheet.sheet_height) : 0;
      if (mw > 0 && mh > 0) {
        layoutCheck = LayoutCalculationService.calculateLayout(productSize, { width: mw, height: mh });
        logger.info('Раскладка по размеру листа выбранного материала', {
          material_id: normalizedConfig.material_id,
          sheet_width: mw,
          sheet_height: mh,
          itemsPerSheet: layoutCheck.itemsPerSheet,
        });
      } else {
        layoutCheck = LayoutCalculationService.findOptimalSheetSize(productSize);
      }
    } else {
      layoutCheck = LayoutCalculationService.findOptimalSheetSize(productSize);
    }
    const itemsPerSheet = Math.max(1, layoutCheck.itemsPerSheet || 1);

    // Проверяем, рулонная ли печать (counter_unit=meters) — для неё другая логика
    const centralPriceForRoll = normalizedConfig.print_technology
      ? await PrintPriceService.getByTechnology(normalizedConfig.print_technology)
      : undefined;
    const isRollPrint = centralPriceForRoll?.counter_unit === 'meters';

    // Офисный принтер или рулонная печать: не ограничиваем мин. тираж по раскладке листов.
    const isOfficePrint = (normalizedConfig.print_technology ?? '').toLowerCase().includes('office');
    const minQtyLimit = selectedSize.min_qty ?? (isOfficePrint || isRollPrint ? 1 : itemsPerSheet);
    const maxQtyLimit = selectedSize.max_qty;
    if (quantity < minQtyLimit || (maxQtyLimit !== undefined && quantity > maxQtyLimit)) {
      const layoutHint = useLayout && !isOfficePrint && minQtyLimit === itemsPerSheet ? ` (по раскладке: ${itemsPerSheet} шт/лист)` : '';
      const err: any = new Error(
        maxQtyLimit !== undefined
          ? `Тираж для размера "${selectedSize.label}" должен быть от ${minQtyLimit} до ${maxQtyLimit}`
          : `Тираж для размера "${selectedSize.label}" должен быть не меньше ${minQtyLimit}${layoutHint}`
      );
      err.status = 400;
      throw err;
    }

    const usePagesMultiplier = product.product_type === 'multi_page';
    const pagesCount = Number((configuration as any).pages);
    const effectivePages = usePagesMultiplier && Number.isFinite(pagesCount) && pagesCount > 0 ? pagesCount : 1;
    const sidesMode = normalizedConfig.print_sides_mode || 'single';
    const sheetsPerItem =
      sidesMode === 'duplex' || sidesMode === 'duplex_bw_back'
        ? Math.max(1, Math.ceil(effectivePages / 2))
        : Math.max(1, effectivePages);
    // Листов к списанию: многостраничные — quantity * листов_на_экземпляр; листовые — ceil(quantity / вместимость_на_лист)
    // Для рулонной печати: пог. м = (длина_изделия_м) × quantity
    const sheetsNeeded = usePagesMultiplier
      ? Math.max(1, quantity * sheetsPerItem)
      : Math.ceil(quantity / itemsPerSheet);
    // Длина в направлении подачи: меньшая сторона (594×420 → 0.42 м, т.к. 420 мм вдоль рулона)
    const metersPerItem = isRollPrint ? Math.min(productSize.width, productSize.height) / 1000 : 0;
    const metersNeeded = isRollPrint ? metersPerItem * quantity : 0;
    const effectivePrintQuantity = isRollPrint ? metersNeeded : sheetsNeeded;

    const isDuplexModeSelected =
      normalizedConfig.print_sides_mode === 'duplex' || normalizedConfig.print_sides_mode === 'duplex_bw_back';
    const duplexAsSingleX2 = simplifiedConfig.duplex_as_single_x2 === true;
    // Для биллинга: если включено правило, оцениваем duplex как (single) ×2.
    // Важно: effectivePrintQuantity/sheetsNeeded не меняем, чтобы списание материалов оставалось фактическим.
    const pricingSidesMode = duplexAsSingleX2 && isDuplexModeSelected ? 'single' : normalizedConfig.print_sides_mode;
    const billingModeMultiplier = duplexAsSingleX2 && isDuplexModeSelected ? 2 : 1;

    // 4. Рассчитываем цену печати
    let printPrice = 0;
    let printDetails: SimplifiedPricingResult['printDetails'] | undefined;
    
    if (normalizedConfig.print_technology && normalizedConfig.print_color_mode && normalizedConfig.print_sides_mode) {
      // Рулонная печать (counter_unit=meters): цена за пог. м × ширина × метры
      if (isRollPrint && centralPriceForRoll) {
        // Ширина по рулону (большая сторона) — для расчёта цены за пог. м
        const widthMeters = Math.max(productSize.width, productSize.height) / 1000;
        const isColor = normalizedConfig.print_color_mode === 'color';
        const perMeter = isColor ? centralPriceForRoll.price_color_per_meter : centralPriceForRoll.price_bw_per_meter;
        if (perMeter != null && perMeter > 0) {
          const unitPricePerMeter = perMeter * widthMeters;
          printPrice = unitPricePerMeter * metersNeeded;
          const pricePerItem = metersNeeded > 0 ? printPrice / quantity : 0;
          printDetails = {
            tier: { min_qty: 1, max_qty: undefined, price: pricePerItem },
            priceForQuantity: printPrice,
          };
          logger.info('Цена печати (рулонная, пог. м)', {
            technology: normalizedConfig.print_technology,
            widthMeters,
            metersNeeded,
            perMeter,
            unitPricePerMeter,
            printPrice,
          });
        } else {
          logger.warn('Цена за пог. м не указана для рулонной технологии', {
            technology: normalizedConfig.print_technology,
            isColor,
          });
        }
      } else {
      const techNorm = (s: string) => (s ?? '').trim().toLowerCase();
      const printPriceConfig = selectedSize.print_prices.find(p =>
        techNorm(p.technology_code) === techNorm(normalizedConfig.print_technology!) &&
        (p.color_mode ?? '').toLowerCase() === (normalizedConfig.print_color_mode ?? '').toLowerCase() &&
        (p.sides_mode ?? '').toLowerCase() === (pricingSidesMode ?? '').toLowerCase()
      );
      
      logger.info('Расчет цены печати', {
        print_technology: normalizedConfig.print_technology,
        print_color_mode: normalizedConfig.print_color_mode,
        print_sides_mode: normalizedConfig.print_sides_mode,
        pricing_sides_mode: pricingSidesMode,
        duplex_as_single_x2: duplexAsSingleX2,
        billing_mode_multiplier: billingModeMultiplier,
        foundConfig: !!printPriceConfig,
        tiersCount: printPriceConfig?.tiers?.length || 0
      });
      
      if (printPriceConfig) {
        // unit_price в шаблоне — «цена за изделие» (UI), tiers.min_qty — в штуках. Ищем по quantity.
        const tier = this.findTierForQuantity(printPriceConfig.tiers, quantity);
        const priceForTier = tier ? this.getPriceForQuantityTier(tier) : 0;
        if (priceForTier > 0) {
          // Листовые продукты: считаем по листам (sheetsNeeded), а не по штукам.
          // При 5 шт/лист и 6 шт — печатаем 2 листа, цена = 2 × price_per_sheet, а не 6 × unit_price.
          // unit_price = price_per_sheet / itemsPerSheet → price_per_sheet = priceForTier * itemsPerSheet
          const pricePerSheet = priceForTier * itemsPerSheet;
          const basePrintPrice = usePagesMultiplier ? priceForTier * quantity : sheetsNeeded * pricePerSheet;
          printPrice = basePrintPrice * billingModeMultiplier;
          printDetails = {
            tier: { min_qty: 1, max_qty: undefined, price: priceForTier },
            priceForQuantity: printPrice,
          };
          logger.info('Цена печати рассчитана', {
            priceForTier,
            quantity,
            sheetsNeeded,
            pricePerSheet,
            pages: effectivePages,
            sheetsPerItem,
            effectivePrintQuantity,
            basePrintPrice,
            billingModeMultiplier,
            printPrice,
          });
        } else if (tier) {
          logger.warn('Цена печати в шаблоне равна 0', { quantity });
        } else {
          logger.warn('Не найден диапазон для печати', { quantity, tiers: printPriceConfig.tiers });
        }
      } else {
        logger.warn('Не найдена конфигурация печати', {
          available: selectedSize.print_prices.map(p => ({
            tech: p.technology_code,
            color: p.color_mode,
            sides: p.sides_mode
          }))
        });
      }
      }
    }
    
    // 5. Рассчитываем цену материала (берём со склада — sheet_price_single, без диапазонов)
    // Можно отключить через simplified.include_material_cost = false
    let materialPrice = 0;
    let materialDetails: SimplifiedPricingResult['materialDetails'] | undefined;

    const includeMaterialCost = simplifiedConfig.include_material_cost !== false;
    if (!includeMaterialCost) {
      logger.info('Стоимость материалов отключена в шаблоне (include_material_cost=false)', { productId });
    }

    if (includeMaterialCost && normalizedConfig.material_id) {
      const isAllowed = selectedSize.allowed_material_ids?.includes(normalizedConfig.material_id) ?? true;
      if (!isAllowed) {
        logger.warn('Материал не в списке разрешённых для размера', { material_id: normalizedConfig.material_id });
      } else {
        const material = await db.get<{ sheet_price_single: number | null }>(
          `SELECT sheet_price_single FROM materials WHERE id = ? AND is_active = 1`,
          [normalizedConfig.material_id]
        );
        const pricePerSheet = material?.sheet_price_single ?? 0;
        const baseMaterialPrice = effectivePrintQuantity * pricePerSheet;
        materialPrice = baseMaterialPrice * billingModeMultiplier;
        materialDetails = {
          tier: { min_qty: 1, max_qty: undefined, price: pricePerSheet },
          priceForQuantity: materialPrice,
        };
        logger.info('Цена материала со склада', {
          material_id: normalizedConfig.material_id,
          pricePerSheet,
          effectivePrintQuantity,
          baseMaterialPrice,
          billingModeMultiplier,
          materialPrice,
        });
      }
    }

    // Материал-основа (заготовка): футболка, кружка — 1 шт на изделие, цена за штуку
    let baseMaterialPrice = 0;
    let selectedBaseMaterialName: string | undefined;
    let baseMaterialDetails: SimplifiedPricingResult['baseMaterialDetails'];
    if (includeMaterialCost && normalizedConfig.base_material_id) {
      const allowedBase = selectedSize.allowed_base_material_ids ?? [];
      const isAllowed = allowedBase.length === 0 || allowedBase.includes(normalizedConfig.base_material_id);
      if (!isAllowed) {
        logger.warn('Материал-основа не в списке разрешённых для размера', { base_material_id: normalizedConfig.base_material_id });
      } else {
        const baseMat = await db.get<{ name: string; sheet_price_single: number | null; unit?: string | null }>(
          `SELECT name, sheet_price_single, unit FROM materials WHERE id = ? AND is_active = 1`,
          [normalizedConfig.base_material_id]
        );
        if (baseMat) {
          selectedBaseMaterialName = baseMat.name;
          const pricePerItem = baseMat.sheet_price_single ?? 0;
          baseMaterialPrice = pricePerItem * quantity;
          materialPrice += baseMaterialPrice;
          baseMaterialDetails = {
            tier: { min_qty: 1, max_qty: undefined, price: pricePerItem },
            priceForQuantity: baseMaterialPrice,
          };
          logger.info('Цена материала-основы (заготовка)', {
            base_material_id: normalizedConfig.base_material_id,
            material_name: baseMat.name,
            pricePerItem,
            quantity,
            baseMaterialPrice,
          });
        } else {
          logger.warn('Материал-основа не найден', { base_material_id: normalizedConfig.base_material_id });
        }
      }
    }
    
    // 6. Рассчитываем цену отделки
    // ⛔ Раньше брали цены из selectedSize.finishing[].tiers (локальные цены в шаблоне продукта)
    // ✅ Теперь всегда берём цены из централизованной системы услуг (service_volume_prices / post_processing_services),
    //    а в simplified-конфиге используем только ссылки на service_id и конфиг units_per_item/price_unit.
    let finishingPrice = 0;
    const finishingDetails: SimplifiedPricingResult['finishingDetails'] = [];
    let serviceTiersMap: Map<string, SimplifiedQtyTier[]> = new Map();
    let serviceTypesMap: Map<number, string> = new Map();
    let servicePriceUnitMap: Map<number, string> = new Map();
    let serviceLimitsMap: Map<number, { min?: number; max?: number }> = new Map();

    // Источник finishing: приоритет у configuration.finishing (выбор пользователя), иначе — selectedSize.finishing (из шаблона размера)
    // При fallback на selectedSize.finishing фильтруем по is_default/is_required: только операции с галочкой «вкл по умолчанию» участвуют в расчёте
    let finishingToUse: Array<{ service_id: number; variant_id?: number; price_unit?: string; units_per_item?: number }>;
    if (normalizedConfig.finishing && normalizedConfig.finishing.length > 0) {
      finishingToUse = normalizedConfig.finishing;
    } else if (Array.isArray(selectedSize.finishing) && selectedSize.finishing.length > 0) {
      const sizeFinishing = selectedSize.finishing;
      const cols = await getTableColumns('product_operations_link');
      const hasIsDefault = cols.has('is_default');
      if (hasIsDefault) {
        const serviceIds = sizeFinishing.map((f: any) => Number(f?.service_id)).filter((id: number) => Number.isFinite(id));
        if (serviceIds.length > 0) {
          const allowed = (await db.all(
            `SELECT operation_id FROM product_operations_link 
             WHERE product_id = ? AND operation_id IN (${serviceIds.map(() => '?').join(',')}) 
             AND (is_required = 1 OR is_default = 1)`,
            [productId, ...serviceIds]
          )) as Array<{ operation_id: number }>;
          const allowedIds = new Set(allowed.map((r) => Number(r.operation_id)));
          finishingToUse = sizeFinishing.filter((f: any) => allowedIds.has(Number(f?.service_id)));
        } else {
          finishingToUse = [];
        }
      } else {
        finishingToUse = sizeFinishing;
      }
    } else {
      finishingToUse = [];
    }

    // При fallback: исключаем операции с min_quantity > quantity (пользователь не выбирал их явно)
    const isFallbackFinishing = !(normalizedConfig.finishing && normalizedConfig.finishing.length > 0) && finishingToUse.length > 0;
    if (isFallbackFinishing && finishingToUse.length > 0) {
      const ids = [...new Set(finishingToUse.map((f: any) => Number(f?.service_id)).filter((id: number) => Number.isFinite(id)))];
      if (ids.length > 0) {
        const limits = (await db.all(
          `SELECT id, min_quantity FROM post_processing_services WHERE id IN (${ids.map(() => '?').join(',')})`,
          ids
        )) as Array<{ id: number; min_quantity?: number | null }>;
        const minByService = new Map(limits.map((r) => [Number(r.id), Number(r.min_quantity ?? 1)]));
        finishingToUse = finishingToUse.filter((f: any) => {
          const minQ = minByService.get(Number(f?.service_id)) ?? 1;
          return quantity >= minQ;
        });
      }
    }

    if (finishingToUse.length > 0) {
      logger.info('🔧 [SimplifiedPricingService] Используем finishing', {
        productId,
        quantity,
        finishing: finishingToUse,
        source: normalizedConfig.finishing?.length ? 'configuration' : 'selectedSize',
      });
      const uniqueServiceIds = Array.from(
        new Set(
          finishingToUse
            .map(f => f.service_id)
            .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
        )
      );
      
      logger.info('🔧 [SimplifiedPricingService] Уникальные service_id для finishing', {
        productId,
        uniqueServiceIds,
      });

      if (uniqueServiceIds.length > 0) {
        const services = await db.all<Array<{ id: number; name: string; operation_type: string | null; price_unit: string | null; min_quantity?: number | null; max_quantity?: number | null }>>(
          `SELECT id, name, operation_type, price_unit, min_quantity, max_quantity FROM post_processing_services WHERE id IN (${uniqueServiceIds.map(() => '?').join(',')})`,
          uniqueServiceIds
        );
        const serviceNamesMap = new Map(services.map(s => [s.id, s.name]));
        serviceTypesMap = new Map(services.map(s => [s.id, s.operation_type || '']));
        servicePriceUnitMap = new Map(services.map(s => [s.id, (s.price_unit || 'per_item').toLowerCase()]));
        serviceLimitsMap = new Map(services.map(s => [s.id, { min: s.min_quantity ?? 1, max: s.max_quantity ?? undefined }]));

        // Загружаем тарифы из service_volume_prices / service_variant_prices через репозиторий
        // 🆕 Для услуг с вариантами используем тарифы варианта, иначе базовые тарифы услуги
        serviceTiersMap = new Map<string, SimplifiedQtyTier[]>(); // Ключ: "serviceId" или "serviceId:variantId"
        
        for (const finConfig of finishingToUse) {
          const serviceId = finConfig.service_id;
          const variantId = (finConfig as any).variant_id as number | undefined;
          const mapKey = variantId ? `${serviceId}:${variantId}` : String(serviceId);
          
          // Пропускаем, если уже загрузили для этого ключа
          if (serviceTiersMap.has(mapKey)) continue;
          
          try {
            // 🆕 Если есть variantId, загружаем тарифы варианта, иначе базовые тарифы услуги
            const tiers = variantId 
              ? await PricingServiceRepository.listServiceTiers(serviceId, variantId)
              : await PricingServiceRepository.listServiceTiers(serviceId);
            
            if (tiers && tiers.length > 0) {
              // Конвертируем ServiceVolumeTierDTO -> SimplifiedQtyTier с расчётом max_qty по следующему minQuantity
              const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
              const simplifiedTiers: SimplifiedQtyTier[] = sorted.map((t, idx) => ({
                min_qty: t.minQuantity,
                max_qty: idx < sorted.length - 1 ? sorted[idx + 1].minQuantity - 1 : undefined,
                unit_price: t.rate,
              }));
              serviceTiersMap.set(mapKey, simplifiedTiers);
              logger.info('🔧 [SimplifiedPricingService] Загружены объёмные тарифы для услуги', {
                productId,
                serviceId,
                variantId,
                tiersCount: simplifiedTiers.length,
                tiers: simplifiedTiers,
              });
            } else {
              // Если нет объёмных тарифов, пробуем взять базовую цену услуги и сделать один бесконечный диапазон
              const baseService = await PricingServiceRepository.getServiceById(serviceId);
              if (baseService && baseService.rate > 0) {
                serviceTiersMap.set(mapKey, [{
                  min_qty: 1,
                  max_qty: undefined,
                  unit_price: baseService.rate,
                }]);
                logger.info('🔧 [SimplifiedPricingService] Используем базовую ставку услуги как единый диапазон', {
                  productId,
                  serviceId,
                  variantId,
                  rate: baseService.rate,
                });
              } else {
                logger.warn('⚠️ [SimplifiedPricingService] Не найдены ни объёмные тарифы, ни базовая ставка для услуги', {
                  productId,
                  serviceId,
                  variantId,
                });
              }
            }
          } catch (error) {
            logger.warn('Не удалось загрузить тарифы услуги для упрощённого калькулятора', {
              productId,
              serviceId,
              variantId,
              error: (error as Error).message,
            });
          }
        }

        logger.info('🔧 [SimplifiedPricingService] Итоговая карта тарифов услуг для finishing', {
          productId,
          serviceIds: Array.from(serviceTiersMap.keys()),
        });

        for (const finConfig of finishingToUse) {
          const variantId = (finConfig as any).variant_id as number | undefined;
          const mapKey = variantId ? `${finConfig.service_id}:${variantId}` : String(finConfig.service_id);
          const operationType = serviceTypesMap.get(finConfig.service_id) || '';
          const limits = serviceLimitsMap.get(finConfig.service_id);
          const priceUnitFromDb = servicePriceUnitMap.get(finConfig.service_id) ?? (finConfig.price_unit ?? 'per_item').toLowerCase();

          // Операции с price_unit=per_sheet: считаем по листам печати (или пог. м для рулонной). До резки обрабатываем целые листы.
          const isPerSheetOp = priceUnitFromDb === 'per_sheet';
          const perSheetUnits = isPerSheetOp
            ? (isRollPrint ? metersNeeded : sheetsNeeded)
            : 0;

          if (limits) {
            const minLimit = limits.min ?? 1;
            const maxLimit = limits.max;
            const checkQty = isPerSheetOp ? perSheetUnits : quantity;
            if (checkQty < minLimit || (maxLimit !== undefined && checkQty > maxLimit)) {
              const serviceName = serviceNamesMap.get(finConfig.service_id) || `Service #${finConfig.service_id}`;
              const unitLabel = isPerSheetOp ? (isRollPrint ? 'пог. м' : 'листов') : 'шт';
              const err: any = new Error(
                maxLimit !== undefined
                  ? `Тираж для операции "${serviceName}" должен быть от ${minLimit} до ${maxLimit} ${unitLabel}`
                  : `Тираж для операции "${serviceName}" должен быть не меньше ${minLimit} ${unitLabel}`
              );
              err.status = 400;
              throw err;
            }
          }
          const tiers = serviceTiersMap.get(mapKey);
          if (!tiers || tiers.length === 0) {
            logger.warn('Не найдены тарифы для услуги отделки в упрощённом калькуляторе', {
              productId,
              serviceId: finConfig.service_id,
            });
            continue;
          }

          const priceUnit = priceUnitFromDb;
          const unitsPerItem = finConfig.units_per_item ?? 1;
          const tierQty = isPerSheetOp ? perSheetUnits : quantity;
          const tier = this.findTierForQuantity(tiers, tierQty);
          if (!tier) {
            logger.warn('Не найден диапазон для услуги отделки', {
              productId,
              serviceId: finConfig.service_id,
              quantity: tierQty,
              tiers,
            });
            continue;
          }

          const priceForTier = this.getPriceForQuantityTier(tier);
          const serviceMinQty = limits?.min ?? 0;
          // Операции «на изделие»: fold/score — кол-во = тираж × units_per_item
          // per_sheet: кол-во = листов печати (или пог. м), с учётом минимального тиража
          const isPerProductOp = ['fold', 'score'].includes(operationType);

          let servicePrice = 0;
          let totalUnits: number;
          if (isPerSheetOp) {
            totalUnits = Math.max(perSheetUnits, serviceMinQty);
            servicePrice = priceForTier * totalUnits;
          } else if (priceUnit === 'per_cut' || isPerProductOp) {
            totalUnits = quantity * unitsPerItem;
            servicePrice = priceForTier * totalUnits;
          } else {
            // per_item: цена за единицу × тираж × units_per_item
            totalUnits = quantity * (unitsPerItem ?? 1);
            servicePrice = priceForTier * totalUnits;
          }
          
          finishingPrice += servicePrice;
          logger.info('💰 [SimplifiedPricingService] Рассчитана цена услуги отделки', {
            productId,
            service_id: finConfig.service_id,
            operationType,
            isPerSheetOp,
            perSheetUnits: isPerSheetOp ? perSheetUnits : undefined,
            sheetsNeeded: isPerSheetOp && !isRollPrint ? sheetsNeeded : undefined,
            metersNeeded: isPerSheetOp && isRollPrint ? metersNeeded : undefined,
            priceUnit,
            unitsPerItem,
            quantity,
            totalUnits,
            priceForTier,
            servicePrice,
          });
          
          finishingDetails.push({
            service_id: finConfig.service_id,
            service_name: serviceNamesMap.get(finConfig.service_id) || `Service #${finConfig.service_id}`,
            tier: { ...tier, price: priceForTier },
            units_needed: totalUnits,
            priceForQuantity: servicePrice,
            price_unit: priceUnit,
            operation_type: operationType,
          });
        }
      }
    }

    // ✂️ Резка по раскладке (стопой): если configuration.cutting === true, считаем резы как cutsPerSheet
    // (режем стопу листов одним проходом — количество резов = число линий раскладки на лист, не × на кол-во листов)
    // Цена: сначала из markup_settings.auto_cutting_price (если > 0), иначе из услуги резки
    const configCutting = (configuration as any).cutting === true;
    if (configCutting) {
      const cuttingService = await db.get<{ id: number; name: string }>(
        `SELECT id, name FROM post_processing_services WHERE operation_type = 'cut' AND price_unit = 'per_cut' AND is_active = 1 LIMIT 1`
      );
      if (cuttingService) {
        const totalCuts = layoutCheck.cutsPerSheet ?? 0;
        if (totalCuts > 0) {
          let pricePerCut = 0;
          const centralPriceRow = await db.get<{ setting_value: number }>(
            `SELECT setting_value FROM markup_settings WHERE setting_name = 'auto_cutting_price' AND is_active = 1`
          );
          const centralPrice = centralPriceRow?.setting_value != null ? Number(centralPriceRow.setting_value) : 0;
          if (centralPrice > 0) {
            pricePerCut = centralPrice;
            logger.info('✂️ [SimplifiedPricingService] Используем централизованную цену резки', { auto_cutting_price: centralPrice });
          } else {
            const tiers = await PricingServiceRepository.listServiceTiers(cuttingService.id);
            if (tiers && tiers.length > 0) {
              const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
              const tier = this.findTierForQuantity(
                sorted.map((t, idx) => ({
                  min_qty: t.minQuantity,
                  max_qty: idx < sorted.length - 1 ? sorted[idx + 1].minQuantity - 1 : undefined,
                  unit_price: t.rate,
                })),
                totalCuts
              );
              pricePerCut = tier ? this.getPriceForQuantityTier(tier) : 0;
            } else {
              const baseService = await PricingServiceRepository.getServiceById(cuttingService.id);
              pricePerCut = baseService?.rate ?? 0;
            }
          }
          const cuttingPrice = pricePerCut * totalCuts;
          finishingPrice += cuttingPrice;
          finishingDetails.push({
            service_id: cuttingService.id,
            service_name: cuttingService.name,
            tier: { min_qty: 1, max_qty: undefined, price: pricePerCut },
            units_needed: totalCuts,
            priceForQuantity: cuttingPrice,
          });
          serviceTypesMap.set(cuttingService.id, 'cut');
          logger.info('✂️ [SimplifiedPricingService] Резка стопой (по раскладке)', {
            productId,
            cutsPerSheet: layoutCheck.cutsPerSheet,
            totalCuts,
            pricePerCut,
            cuttingPrice,
          });
        }
      } else {
        logger.warn('✂️ [SimplifiedPricingService] Резка включена, но не найдена услуга operation_type=cut, price_unit=per_cut');
      }
    }
    
    // 7. Рассчитываем итоги (округление до 2 знаков — как в buildTierPricesForConfig, чтобы финальная цена совпадала с «Цена» в диапазонах)
    let subtotal = printPrice + materialPrice + finishingPrice;
    let finalPrice = Math.round(subtotal * 100) / 100;
    let pricePerUnit = quantity > 0 ? Math.round((finalPrice / quantity) * 100) / 100 : 0;
    
    logger.info('Итоговый расчет упрощенного калькулятора', {
      productId,
      quantity,
      printPrice,
      materialPrice,
      finishingPrice,
      subtotal,
      finalPrice,
      pricePerUnit,
      hasPrintConfig: !!(normalizedConfig.print_technology && normalizedConfig.print_color_mode && normalizedConfig.print_sides_mode),
      hasMaterialConfig: !!normalizedConfig.material_id,
      hasFinishingConfig: finishingToUse.length > 0
    });
    
    if (finalPrice === 0) {
      logger.error('Итоговая цена равна нулю!', {
        printPrice,
        materialPrice,
        finishingPrice,
        originalConfiguration: configuration,
        normalizedConfig,
        selectedSize: {
          id: selectedSize.id,
          print_prices_count: selectedSize.print_prices.length,
          material_prices_count: selectedSize.material_prices.length,
          finishing_count: selectedSize.finishing.length
        }
      });
    }

    // 7.5. Цены по диапазонам тиража для выбранной конфигурации
    const printPriceConfigForTiers = !isRollPrint && normalizedConfig.print_technology && normalizedConfig.print_color_mode && normalizedConfig.print_sides_mode
      ? selectedSize.print_prices.find((p: any) =>
          (p.technology_code ?? '').toLowerCase() === (normalizedConfig.print_technology ?? '').toLowerCase() &&
          (p.color_mode ?? '').toLowerCase() === (normalizedConfig.print_color_mode ?? '').toLowerCase() &&
          (p.sides_mode ?? '').toLowerCase() === (pricingSidesMode ?? '').toLowerCase()
        )
      : undefined;
    const materialPricePerSheet = includeMaterialCost && normalizedConfig.material_id
      ? ((await db.get<{ sheet_price_single: number }>('SELECT sheet_price_single FROM materials WHERE id = ?', [normalizedConfig.material_id]))?.sheet_price_single ?? 0)
      : 0;
    const baseMaterialPricePerItem = normalizedConfig.base_material_id
      ? ((await db.get<{ sheet_price_single: number }>('SELECT sheet_price_single FROM materials WHERE id = ?', [normalizedConfig.base_material_id]))?.sheet_price_single ?? 0)
      : 0;
    const cuttingPricePerCut = configCutting && (layoutCheck.cutsPerSheet ?? 0) > 0
      ? (finishingDetails.find((d: any) => (serviceTypesMap.get(d.service_id) || '').toLowerCase() === 'cut')?.tier?.price ?? 0)
      : 0;
    const tierPricesResult = this.buildTierPricesForConfig({
      printPriceConfig: printPriceConfigForTiers,
      materialPricePerSheet,
      baseMaterialPricePerItem,
      serviceTiersMap: serviceTiersMap ?? new Map(),
      serviceLimitsMap: serviceLimitsMap ?? new Map(),
      finishingConfig: finishingToUse,
      selectedSize,
      layoutCheck,
      itemsPerSheet,
      usePagesMultiplier,
      effectivePages,
      sheetsPerItem,
      billingModeMultiplier,
      configCutting,
      cuttingPricePerCut,
      cutsPerSheet: layoutCheck.cutsPerSheet ?? 0,
      serviceTypesMap: serviceTypesMap ?? new Map(),
      servicePriceUnitMap: servicePriceUnitMap ?? new Map(),
      currentQuantity: quantity,
      isRollPrint,
      metersPerItem,
    });
    
    // 8. Загружаем названия, плотность и тип бумаги материалов
    let materialName = `Material #${normalizedConfig.material_id}`;
    let materialDensity: number | undefined = undefined;
    let materialPaperTypeName: string | undefined = undefined;
    if (normalizedConfig.material_id) {
      // 🆕 Загружаем также paper_type_name для установки materialType на фронтенде
      const material = await db.get<{ name: string; density?: number; paper_type_id?: number }>(
        `SELECT m.name, m.density, m.paper_type_id 
         FROM materials m 
         WHERE m.id = ?`,
        [normalizedConfig.material_id]
      );
      if (material) {
        materialName = material.name;
        materialDensity = material.density || undefined;
        
        // 🆕 Получаем display_name типа бумаги для материала
        if (material.paper_type_id) {
          const paperType = await db.get<{ display_name: string }>(
            `SELECT display_name FROM paper_types WHERE id = ? AND is_active = 1`,
            [material.paper_type_id]
          );
          if (paperType) {
            materialPaperTypeName = paperType.display_name;
          }
        }
      }
    }

    const layoutResult: SimplifiedPricingResult['layout'] = {
      fitsOnSheet: layoutCheck.fitsOnSheet,
      itemsPerSheet: layoutCheck.itemsPerSheet,
      sheetsNeeded: isRollPrint ? 0 : sheetsNeeded,
      ...(isRollPrint && { metersNeeded }),
      wastePercentage: layoutCheck.wastePercentage,
      recommendedSheetSize: layoutCheck.recommendedSheetSize,
    };
    const warnings: string[] = [];
    if (!isRollPrint && !layoutCheck.fitsOnSheet) {
      warnings.push(
        `Формат ${selectedSize.width_mm}×${selectedSize.height_mm} мм не помещается на стандартные печатные листы (SRA3, A3, A4). Проверьте размер.`
      );
    }

    // 9. Множитель типа цены (priceType): standard, online, urgent, promo, special
    const priceTypeKey = String(
      (configuration as any).priceType ??
      (configuration as any).price_type ??
      (configuration as any).urgency ??
      'standard'
    ).trim().toLowerCase() || 'standard';
    const priceTypeMult = await PriceTypeService.getMultiplier(priceTypeKey);
    if (priceTypeMult !== 1) {
      logger.info('Применяем множитель типа цены', { priceTypeKey, multiplier: priceTypeMult });
      printPrice *= priceTypeMult;
      materialPrice *= priceTypeMult;
      finishingPrice *= priceTypeMult;
      subtotal *= priceTypeMult;
      finalPrice *= priceTypeMult;
      pricePerUnit *= priceTypeMult;
      if (printDetails) {
        printDetails.tier = { ...printDetails.tier, price: printDetails.tier.price * priceTypeMult };
        printDetails.priceForQuantity *= priceTypeMult;
      }
      if (materialDetails) {
        materialDetails.tier = { ...materialDetails.tier, price: materialDetails.tier.price * priceTypeMult };
        materialDetails.priceForQuantity *= priceTypeMult;
      }
      if (baseMaterialDetails) {
        baseMaterialDetails.tier = { ...baseMaterialDetails.tier, price: baseMaterialDetails.tier.price * priceTypeMult };
        baseMaterialDetails.priceForQuantity *= priceTypeMult;
      }
      finishingDetails.forEach((d) => {
        d.tier = { ...d.tier, price: d.tier.price * priceTypeMult };
        d.priceForQuantity *= priceTypeMult;
      });
      tierPricesResult.forEach((t) => {
        t.unit_price *= priceTypeMult;
        if (t.total_price != null) t.total_price *= priceTypeMult;
      });
      // Округляем после множителя, чтобы избежать 24.497 вместо 24.50
      finalPrice = Math.round(finalPrice * 100) / 100;
      pricePerUnit = quantity > 0 ? Math.round((finalPrice / quantity) * 100) / 100 : 0;
      tierPricesResult.forEach((t) => {
        t.unit_price = Math.round(t.unit_price * 100) / 100;
        if (t.total_price != null) t.total_price = Math.round(t.total_price * 100) / 100;
      });
    }

    return {
      productId,
      productName: product.name,
      quantity,
      selectedSize: {
        id: selectedSize.id,
        label: selectedSize.label,
        width_mm: selectedSize.width_mm,
        height_mm: selectedSize.height_mm,
      },
      selectedPrint: normalizedConfig.print_technology && normalizedConfig.print_color_mode && normalizedConfig.print_sides_mode ? {
        technology_code: normalizedConfig.print_technology,
        color_mode: normalizedConfig.print_color_mode,
        sides_mode: normalizedConfig.print_sides_mode,
      } : undefined,
      selectedMaterial: normalizedConfig.material_id ? {
        material_id: normalizedConfig.material_id,
        material_name: materialName,
        density: materialDensity, // 🆕 Добавляем плотность материала
        paper_type_name: materialPaperTypeName, // 🆕 Добавляем display_name типа бумаги для установки materialType
      } : undefined,
      selectedBaseMaterial: normalizedConfig.base_material_id && selectedBaseMaterialName ? {
        material_id: normalizedConfig.base_material_id,
        material_name: selectedBaseMaterialName,
      } : undefined,
      selectedFinishing: finishingDetails.map(d => {
        const finConfig = selectedSize.finishing.find(f => f.service_id === d.service_id);
        return {
          service_id: d.service_id,
          service_name: d.service_name,
          price_unit: finConfig?.price_unit || 'per_item',
          units_per_item: d.units_needed / quantity,
        };
      }),
      printPrice,
      materialPrice,
      finishingPrice,
      subtotal,
      finalPrice,
      pricePerUnit,
      printDetails,
      materialDetails,
      baseMaterialDetails,
      finishingDetails: finishingDetails.length > 0 ? finishingDetails : undefined,
      ...(tierPricesResult.length > 0 ? { tier_prices: tierPricesResult } : {}),
      calculatedAt: new Date().toISOString(),
      calculationMethod: 'simplified',
      layout: layoutResult,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
  
  /**
   * Строит цены за единицу по диапазонам тиража для выбранной конфигурации
   */
  private static buildTierPricesForConfig(ctx: {
    printPriceConfig: any;
    materialPricePerSheet: number;
    baseMaterialPricePerItem: number;
    serviceTiersMap: Map<string, SimplifiedQtyTier[]>;
    serviceLimitsMap?: Map<number, { min?: number; max?: number }>;
    finishingConfig: Array<{ service_id: number; variant_id?: number; price_unit?: string; units_per_item?: number }>;
    selectedSize: SimplifiedSizeConfig;
    layoutCheck: any;
    itemsPerSheet: number;
    usePagesMultiplier: boolean;
    effectivePages: number;
    sheetsPerItem: number;
    billingModeMultiplier: number;
    configCutting: boolean;
    cuttingPricePerCut: number;
    cutsPerSheet: number;
    serviceTypesMap: Map<number, string>;
    servicePriceUnitMap?: Map<number, string>;
    /** Текущее количество — добавляем в boundaries, чтобы «Цена» для выбранного тиража совпадала с итогом */
    currentQuantity?: number;
    isRollPrint?: boolean;
    metersPerItem?: number;
  }): Array<{ min_qty: number; max_qty?: number; unit_price: number; total_price: number }> {
    const boundaries = new Set<number>();

    // 1. Текущее количество — в границах, строка в своей позиции между диапазонами
    if (ctx.currentQuantity != null && Number.isFinite(ctx.currentQuantity) && ctx.currentQuantity > 0) {
      boundaries.add(ctx.currentQuantity);
    }

    // 2. Диапазоны из схемы: print_prices для выбранного размера (наследуют от принтера при «Запросить цены»)
    if (ctx.printPriceConfig?.tiers?.length) {
      ctx.printPriceConfig.tiers.forEach((t: SimplifiedQtyTier) => {
        if (t.min_qty != null && Number.isFinite(t.min_qty)) boundaries.add(t.min_qty);
      });
    }

    // 3. Диапазоны из material_prices для выбранного размера
    if (ctx.selectedSize?.material_prices?.length) {
      ctx.selectedSize.material_prices.forEach((mp: { material_id: number; tiers?: SimplifiedQtyTier[] }) => {
        mp.tiers?.forEach((t: SimplifiedQtyTier) => {
          if (t.min_qty != null && Number.isFinite(t.min_qty)) boundaries.add(t.min_qty);
        });
      });
    }

    // 4. Диапазоны из finishing
    ctx.finishingConfig.forEach((f) => {
      const mapKey = f.variant_id ? `${f.service_id}:${f.variant_id}` : String(f.service_id);
      const tiers = ctx.serviceTiersMap.get(mapKey);
      tiers?.forEach((t) => {
        if (t.min_qty != null && Number.isFinite(t.min_qty)) boundaries.add(t.min_qty);
      });
    });

    // Fallback: если в схеме нет диапазонов — минимум itemsPerSheet (рекомендуемое кол-во)
    if (boundaries.size === 0) {
      const ips = Math.max(1, ctx.itemsPerSheet || 1);
      boundaries.add(ips);
    }

    const sorted = Array.from(boundaries).sort((a, b) => a - b);
    const result: Array<{ min_qty: number; max_qty?: number; unit_price: number; total_price: number }> = [];

    for (let i = 0; i < sorted.length; i++) {
      const q = sorted[i];
      const nextQ = sorted[i + 1];
      const maxQty = nextQ != null ? nextQ - 1 : undefined;

      let printPrice = 0;
      if (ctx.printPriceConfig?.tiers?.length) {
        const tier = this.findTierForQuantity(ctx.printPriceConfig.tiers, q);
        const priceForTier = tier ? this.getPriceForQuantityTier(tier) : 0;
        if (priceForTier > 0) {
          const sheetsNeeded = ctx.usePagesMultiplier ? Math.max(1, q * ctx.sheetsPerItem) : Math.ceil(q / ctx.itemsPerSheet);
          const pricePerSheet = priceForTier * ctx.itemsPerSheet;
          const basePrintPrice = ctx.usePagesMultiplier ? priceForTier * q : sheetsNeeded * pricePerSheet;
          printPrice = basePrintPrice * ctx.billingModeMultiplier;
        }
      }

      let materialPrice = 0;
      if (ctx.materialPricePerSheet > 0) {
        const sheetsNeeded = ctx.usePagesMultiplier
          ? Math.max(1, q * ctx.sheetsPerItem)
          : Math.ceil(q / ctx.itemsPerSheet);
        materialPrice = sheetsNeeded * ctx.materialPricePerSheet * ctx.billingModeMultiplier;
      }
      if (ctx.baseMaterialPricePerItem > 0) {
        materialPrice += ctx.baseMaterialPricePerItem * q;
      }

      let finishingPrice = 0;
      const sheetsForQ = ctx.usePagesMultiplier ? Math.max(1, q * ctx.sheetsPerItem) : Math.ceil(q / ctx.itemsPerSheet);
      const metersForQ = ctx.isRollPrint && (ctx.metersPerItem ?? 0) > 0 ? (ctx.metersPerItem! * q) : 0;
      for (const finConfig of ctx.finishingConfig) {
        const mapKey = finConfig.variant_id ? `${finConfig.service_id}:${finConfig.variant_id}` : String(finConfig.service_id);
        const tiers = ctx.serviceTiersMap.get(mapKey);
        if (!tiers?.length) continue;
        const operationType = ctx.serviceTypesMap.get(finConfig.service_id) || '';
        const priceUnitFromDb = (ctx.servicePriceUnitMap?.get(finConfig.service_id) ?? finConfig.price_unit ?? 'per_item').toLowerCase();
        const isPerSheetOp = priceUnitFromDb === 'per_sheet';
        const perSheetUnits = isPerSheetOp ? (ctx.isRollPrint ? metersForQ : sheetsForQ) : 0;
        const tierQty = isPerSheetOp ? perSheetUnits : q;
        const tier = this.findTierForQuantity(tiers, tierQty);
        if (!tier) continue;
        const priceForTier = this.getPriceForQuantityTier(tier);
        const priceUnit = priceUnitFromDb;
        const unitsPerItem = finConfig.units_per_item ?? 1;
        const serviceMinQty = ctx.serviceLimitsMap?.get(finConfig.service_id)?.min ?? 0;
        const isPerProductOp = ['fold', 'score'].includes(operationType);
        if (isPerSheetOp) {
          const totalUnits = Math.max(perSheetUnits, serviceMinQty);
          finishingPrice += priceForTier * totalUnits;
        } else if (priceUnit === 'per_cut' || isPerProductOp) {
          finishingPrice += priceForTier * (q * unitsPerItem);
        } else {
          // per_item: цена за единицу × тираж × units_per_item
          finishingPrice += priceForTier * (q * (unitsPerItem ?? 1));
        }
      }

      let cuttingPrice = 0;
      if (ctx.configCutting && ctx.cutsPerSheet > 0 && ctx.cuttingPricePerCut > 0) {
        cuttingPrice = ctx.cutsPerSheet * ctx.cuttingPricePerCut;
      }

      const total = printPrice + materialPrice + finishingPrice + cuttingPrice;
      const totalRounded = Math.round(total * 100) / 100;
      const unitPrice = q > 0 ? totalRounded / q : 0;
      // total_price — фактическая сумма (как в main calculation), чтобы «Цена» в таблице совпадала с основной суммой
      result.push({
        min_qty: q,
        max_qty: maxQty,
        unit_price: Math.round(unitPrice * 100) / 100,
        total_price: totalRounded,
      });
    }
    return result;
  }

  /**
   * Находит подходящий диапазон тиража для заданного количества
   */
  private static findTierForQuantity(
    tiers: SimplifiedQtyTier[],
    quantity: number
  ): SimplifiedQtyTier | null {
    if (!tiers || tiers.length === 0) {
      logger.warn('findTierForQuantity: tiers пустой', { quantity });
      return null;
    }
    
    // Сортируем по min_qty (от большего к меньшему)
    const sortedTiers = [...tiers].sort((a, b) => {
      if (b.min_qty !== a.min_qty) {
        return b.min_qty - a.min_qty;
      }
      // Если min_qty одинаковые, приоритет тем, у кого меньше max_qty
      if (a.max_qty === undefined && b.max_qty === undefined) return 0;
      if (a.max_qty === undefined) return 1;
      if (b.max_qty === undefined) return -1;
      return a.max_qty - b.max_qty;
    });
    
    logger.info('findTierForQuantity: поиск диапазона', {
      quantity,
      tiersCount: sortedTiers.length,
      tiers: sortedTiers.map(t => ({ min_qty: t.min_qty, max_qty: t.max_qty, unit_price: t.unit_price }))
    });
    
    for (const tier of sortedTiers) {
      if (quantity >= tier.min_qty) {
        if (tier.max_qty === undefined || quantity <= tier.max_qty) {
          logger.info('findTierForQuantity: найден диапазон', {
            quantity,
            tier: { min_qty: tier.min_qty, max_qty: tier.max_qty, unit_price: tier.unit_price }
          });
          return tier;
        }
      }
    }
    
    // Если не нашли, возвращаем первый (самый дешёвый)
    if (tiers.length > 0) {
      logger.warn('findTierForQuantity: не найден подходящий диапазон, возвращаем первый', {
        quantity,
        firstTier: { min_qty: tiers[0].min_qty, max_qty: tiers[0].max_qty, unit_price: tiers[0].unit_price }
      });
      return tiers[0];
    }
    
    return null;
  }
  
  /**
   * Определяет цену за единицу из диапазона
   * Использует unit_price, если доступен, иначе использует price или tier_prices для обратной совместимости
   */
  private static getPriceForQuantityTier(tier: SimplifiedQtyTier): number {
    // Приоритет: unit_price > price > tier_prices (для обратной совместимости)
    if (tier.unit_price !== undefined && tier.unit_price !== null) {
      return tier.unit_price;
    }
    
    // Обратная совместимость: используем price если unit_price нет
    if (tier.price !== undefined && tier.price !== null) {
      return tier.price;
    }
    
    // Обратная совместимость: используем первую цену из tier_prices, если доступна
    if (tier.tier_prices && tier.tier_prices.length > 0) {
      return tier.tier_prices[0] ?? 0;
    }
    
    return 0;
  }
}

