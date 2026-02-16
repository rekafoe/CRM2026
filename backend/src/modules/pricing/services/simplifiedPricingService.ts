/**
 * 🎯 Упрощённый калькулятор цен
 * 
 * Используется для продуктов с calculator_type='simplified'
 * Рассчитывает цены напрямую из config_data.simplified без FlexiblePricingService
 */

import { getDb } from '../../../db';
import { logger } from '../../../utils/logger';
import { PricingServiceRepository } from '../repositories/serviceRepository';
import { LayoutCalculationService } from './layoutCalculationService';

export interface SimplifiedPricingResult {
  productId: number;
  productName: string;
  quantity: number;
  
  // Выбранная конфигурация
  selectedSize?: {
    id: string;
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
  finishingDetails?: Array<{
    service_id: number;
    service_name: string;
    tier: { min_qty: number; max_qty?: number; price: number };
    units_needed: number;
    priceForQuantity: number;
  }>;
  
  calculatedAt: string;
  calculationMethod: 'simplified';
  /** Проверка вместимости формата на печатный лист (SRA3/A3/A4); sheetsNeeded — листов к списанию */
  layout?: {
    fitsOnSheet: boolean;
    itemsPerSheet: number;
    sheetsNeeded: number;
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
  id: string;
  label: string;
  width_mm: number;
  height_mm: number;
  min_qty?: number;
  max_qty?: number;
  allowed_material_ids?: number[];
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
}

export class SimplifiedPricingService {
  /**
   * Рассчитывает цену для упрощённого калькулятора
   */
  static async calculatePrice(
    productId: number,
    configuration: {
      size_id?: string;
      trim_size?: { width: number; height: number };
      print_technology?: string;
      print_color_mode?: 'color' | 'bw';
      print_sides_mode?: 'single' | 'duplex' | 'duplex_bw_back';
      material_id?: number;
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
    
    if (!simplifiedConfig.sizes || simplifiedConfig.sizes.length === 0) {
      throw new Error('No sizes configured in simplified config');
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
      selectedSize = simplifiedConfig.sizes.find(s => s.id === normalizedConfig.size_id) || null;
    } else if (normalizedConfig.trim_size) {
      // Ищем по размерам (примерное совпадение с допуском ±1мм)
      selectedSize = simplifiedConfig.sizes.find(s => 
        Math.abs(s.width_mm - normalizedConfig.trim_size!.width) <= 1 &&
        Math.abs(s.height_mm - normalizedConfig.trim_size!.height) <= 1
      ) || null;
    }
    
    if (!selectedSize) {
      throw new Error('Selected size not found in simplified config');
    }

    const productSize = { width: selectedSize.width_mm, height: selectedSize.height_mm };

    // Раскладка: сколько изделий на лист. Печатный лист = выбранный материал (если у материала заданы размеры), иначе SRA3/A3/A4.
    let layoutCheck: { fitsOnSheet: boolean; itemsPerSheet: number; wastePercentage: number; recommendedSheetSize: { width: number; height: number }; layout: { rows: number; cols: number; actualItemsPerSheet: number }; cutsPerSheet: number };
    if (normalizedConfig.material_id) {
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

    // Офисный принтер: печатают A3/A4 как есть, без раскладки — не ограничиваем мин. тираж по листу.
    const isOfficePrint = (normalizedConfig.print_technology ?? '').toLowerCase().includes('office');
    const minQtyLimit = selectedSize.min_qty ?? (isOfficePrint ? 1 : itemsPerSheet);
    const maxQtyLimit = selectedSize.max_qty;
    if (quantity < minQtyLimit || (maxQtyLimit !== undefined && quantity > maxQtyLimit)) {
      const layoutHint = !isOfficePrint && minQtyLimit === itemsPerSheet ? ` (по раскладке: ${itemsPerSheet} шт/лист)` : '';
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
    const sheetsNeeded = usePagesMultiplier
      ? Math.max(1, quantity * sheetsPerItem)
      : Math.ceil(quantity / itemsPerSheet);
    const effectivePrintQuantity = sheetsNeeded;

    // 4. Рассчитываем цену печати
    let printPrice = 0;
    let printDetails: SimplifiedPricingResult['printDetails'] | undefined;
    
    if (normalizedConfig.print_technology && normalizedConfig.print_color_mode && normalizedConfig.print_sides_mode) {
      const printPriceConfig = selectedSize.print_prices.find(p =>
        p.technology_code === normalizedConfig.print_technology &&
        p.color_mode === normalizedConfig.print_color_mode &&
        p.sides_mode === normalizedConfig.print_sides_mode
      );
      
      logger.info('Расчет цены печати', {
        print_technology: normalizedConfig.print_technology,
        print_color_mode: normalizedConfig.print_color_mode,
        print_sides_mode: normalizedConfig.print_sides_mode,
        foundConfig: !!printPriceConfig,
        tiersCount: printPriceConfig?.tiers?.length || 0
      });
      
      if (printPriceConfig) {
        const tier = this.findTierForQuantity(printPriceConfig.tiers, effectivePrintQuantity);
        if (tier) {
          // Используем unit_price из диапазона
          const priceForTier = this.getPriceForQuantityTier(tier);
          printPrice = priceForTier * effectivePrintQuantity;
          printDetails = {
            tier: { ...tier, price: priceForTier },
            priceForQuantity: printPrice,
          };
          logger.info('Цена печати рассчитана', {
            priceForTier,
            quantity,
            pages: effectivePages,
            sheetsPerItem,
            effectivePrintQuantity,
            printPrice,
          });
        } else {
          logger.warn('Не найден диапазон для печати', { effectivePrintQuantity, tiers: printPriceConfig.tiers });
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
    
    // 5. Рассчитываем цену материала (берём со склада — sheet_price_single, без диапазонов)
    let materialPrice = 0;
    let materialDetails: SimplifiedPricingResult['materialDetails'] | undefined;
    
    if (normalizedConfig.material_id) {
      const isAllowed = selectedSize.allowed_material_ids?.includes(normalizedConfig.material_id) ?? true;
      if (!isAllowed) {
        logger.warn('Материал не в списке разрешённых для размера', { material_id: normalizedConfig.material_id });
      } else {
        const material = await db.get<{ sheet_price_single: number | null }>(
          `SELECT sheet_price_single FROM materials WHERE id = ? AND is_active = 1`,
          [normalizedConfig.material_id]
        );
        const pricePerSheet = material?.sheet_price_single ?? 0;
        materialPrice = effectivePrintQuantity * pricePerSheet;
        materialDetails = {
          tier: { min_qty: 1, max_qty: undefined, price: pricePerSheet },
          priceForQuantity: materialPrice,
        };
        logger.info('Цена материала со склада', {
          material_id: normalizedConfig.material_id,
          pricePerSheet,
          effectivePrintQuantity,
          materialPrice,
        });
      }
    }
    
    // 6. Рассчитываем цену отделки
    // ⛔ Раньше брали цены из selectedSize.finishing[].tiers (локальные цены в шаблоне продукта)
    // ✅ Теперь всегда берём цены из централизованной системы услуг (service_volume_prices / post_processing_services),
    //    а в simplified-конфиге используем только ссылки на service_id и конфиг units_per_item/price_unit.
    let finishingPrice = 0;
    const finishingDetails: SimplifiedPricingResult['finishingDetails'] = [];
    
    if (normalizedConfig.finishing && normalizedConfig.finishing.length > 0) {
      logger.info('🔧 [SimplifiedPricingService] Получена конфигурация finishing из фронтенда', {
        productId,
        quantity,
        finishing: normalizedConfig.finishing,
      });
      // Загружаем названия услуг и централизованные тарифы
      const uniqueServiceIds = Array.from(
        new Set(
          normalizedConfig.finishing
            .map(f => f.service_id)
            .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
        )
      );
      
      logger.info('🔧 [SimplifiedPricingService] Уникальные service_id для finishing', {
        productId,
        uniqueServiceIds,
      });

      if (uniqueServiceIds.length > 0) {
        const services = await db.all<Array<{ id: number; name: string; operation_type: string | null; min_quantity?: number | null; max_quantity?: number | null }>>(
          `SELECT id, name, operation_type, min_quantity, max_quantity FROM post_processing_services WHERE id IN (${uniqueServiceIds.map(() => '?').join(',')})`,
          uniqueServiceIds
        );
        const serviceNamesMap = new Map(services.map(s => [s.id, s.name]));
        const serviceTypesMap = new Map(services.map(s => [s.id, s.operation_type || '']));
        const serviceLimitsMap = new Map(services.map(s => [s.id, { min: s.min_quantity ?? 1, max: s.max_quantity ?? undefined }]));

        // Загружаем тарифы из service_volume_prices / service_variant_prices через репозиторий
        // 🆕 Для услуг с вариантами используем тарифы варианта, иначе базовые тарифы услуги
        const serviceTiersMap = new Map<string, SimplifiedQtyTier[]>(); // Ключ: "serviceId" или "serviceId:variantId"
        
        for (const finConfig of normalizedConfig.finishing) {
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

        for (const finConfig of normalizedConfig.finishing) {
          // 🆕 Используем ключ с variantId, если он есть
          const variantId = (finConfig as any).variant_id as number | undefined;
          const mapKey = variantId ? `${finConfig.service_id}:${variantId}` : String(finConfig.service_id);
          const limits = serviceLimitsMap.get(finConfig.service_id);
          if (limits) {
            const minLimit = limits.min ?? 1;
            const maxLimit = limits.max;
            if (quantity < minLimit || (maxLimit !== undefined && quantity > maxLimit)) {
              const serviceName = serviceNamesMap.get(finConfig.service_id) || `Service #${finConfig.service_id}`;
              const err: any = new Error(
                maxLimit !== undefined
                  ? `Тираж для операции "${serviceName}" должен быть от ${minLimit} до ${maxLimit}`
                  : `Тираж для операции "${serviceName}" должен быть не меньше ${minLimit}`
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

          const tier = this.findTierForQuantity(tiers, quantity);
          if (!tier) {
            logger.warn('Не найден диапазон для услуги отделки', {
              productId,
              serviceId: finConfig.service_id,
              quantity,
              tiers,
            });
            continue;
          }

          const priceForTier = this.getPriceForQuantityTier(tier);
          const priceUnit = finConfig.price_unit ?? 'per_item';
          const unitsPerItem = finConfig.units_per_item ?? 1;
          
          // 🆕 Определяем, является ли операция ламинацией по строгому типу
          const operationType = serviceTypesMap.get(finConfig.service_id) || '';
          const isLamination = operationType === 'laminate';
          
          let servicePrice = 0;
          let totalUnits = quantity;
          if (priceUnit === 'per_cut') {
            // Цена за единицу операции (рез/биг/фальц) — считаем общее количество операций
            // units_per_item = количество резов на одно изделие, умножаем на тираж
            totalUnits = quantity * unitsPerItem;
            servicePrice = priceForTier * totalUnits;
          } else if (isLamination) {
            // 🆕 Для ламинации: цена за одно изделие, умножаем на тираж
            // units_per_item обычно = 1 (одна ламинация на одно изделие)
            totalUnits = quantity * unitsPerItem;
            servicePrice = priceForTier * totalUnits;
          } else {
            // ✅ Цена за изделие (per_item): units_per_item означает "общее количество единиц услуги на весь заказ"
            // Например, для "Упаковка в файл": если пользователь ввёл "Количество" = 1, то это 1 файл на весь заказ
            // Цена = unit_price * 1 (не умножаем на тираж!)
            totalUnits = unitsPerItem;
            servicePrice = priceForTier * totalUnits;
          }
          
          finishingPrice += servicePrice;
          logger.info('💰 [SimplifiedPricingService] Рассчитана цена услуги отделки', {
            productId,
            service_id: finConfig.service_id,
            operationType,
            isLamination,
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
          });
        }
      }
    }
    
    // 7. Рассчитываем итоги
    const subtotal = printPrice + materialPrice + finishingPrice;
    const finalPrice = subtotal; // В упрощённом калькуляторе не применяем наценки (они уже учтены в ценах)
    const pricePerUnit = quantity > 0 ? finalPrice / quantity : 0;
    
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
      hasFinishingConfig: !!(normalizedConfig.finishing && normalizedConfig.finishing.length > 0)
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
      sheetsNeeded,
      wastePercentage: layoutCheck.wastePercentage,
      recommendedSheetSize: layoutCheck.recommendedSheetSize,
    };
    const warnings: string[] = [];
    if (!layoutCheck.fitsOnSheet) {
      warnings.push(
        `Формат ${selectedSize.width_mm}×${selectedSize.height_mm} мм не помещается на стандартные печатные листы (SRA3, A3, A4). Проверьте размер.`
      );
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
      finishingDetails: finishingDetails.length > 0 ? finishingDetails : undefined,
      calculatedAt: new Date().toISOString(),
      calculationMethod: 'simplified',
      layout: layoutResult,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
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

