/**
 * 🎯 Упрощённый калькулятор цен
 * 
 * Используется для продуктов с calculator_type='simplified'
 * Рассчитывает цены напрямую из config_data.simplified без FlexiblePricingService
 */

import { getDb } from '../../../db';
import { logger } from '../../../utils/logger';

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
    tiers: SimplifiedQtyTier[];
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
    const product = await db.get<{ id: number; name: string; calculator_type: string }>(
      `SELECT id, name, calculator_type FROM products WHERE id = ?`,
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
        const paperTypeId = (configuration as any).paperType;
        const paperDensity = Number((configuration as any).paperDensity);
        
        // Загружаем тип бумаги из склада
        const paperType = await db.get<{ id: string; densities: string }>(
          `SELECT id, densities FROM warehouse_paper_types WHERE id = ?`,
          [paperTypeId]
        );
        
        if (paperType) {
          const densities = typeof paperType.densities === 'string' 
            ? JSON.parse(paperType.densities) 
            : paperType.densities;
          
          const density = Array.isArray(densities) 
            ? densities.find((d: any) => d.value === paperDensity)
            : null;
          
          if (density && density.material_id) {
            normalizedConfig.material_id = Number(density.material_id);
            logger.info('Нормализация: найдено material_id по paperType и paperDensity', {
              paperType: paperTypeId,
              paperDensity,
              material_id: normalizedConfig.material_id
            });
          } else {
            logger.warn('Не найдена плотность в типе бумаги', {
              paperType: paperTypeId,
              paperDensity,
              availableDensities: Array.isArray(densities) ? densities.map((d: any) => d.value) : []
            });
          }
        } else {
          logger.warn('Тип бумаги не найден в складе', { paperType: paperTypeId });
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
        const tier = this.findTierForQuantity(printPriceConfig.tiers, quantity);
        if (tier) {
          // Используем unit_price из диапазона
          const priceForTier = this.getPriceForQuantityTier(tier);
          printPrice = priceForTier * quantity;
          printDetails = {
            tier: { ...tier, price: priceForTier },
            priceForQuantity: printPrice,
          };
          logger.info('Цена печати рассчитана', { priceForTier, quantity, printPrice });
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
    
    // 5. Рассчитываем цену материала
    let materialPrice = 0;
    let materialDetails: SimplifiedPricingResult['materialDetails'] | undefined;
    
    if (normalizedConfig.material_id) {
      const materialPriceConfig = selectedSize.material_prices.find(m => m.material_id === normalizedConfig.material_id);
      
      logger.info('Расчет цены материала', {
        material_id: normalizedConfig.material_id,
        foundConfig: !!materialPriceConfig,
        tiersCount: materialPriceConfig?.tiers?.length || 0
      });
      
      if (materialPriceConfig) {
        const tier = this.findTierForQuantity(materialPriceConfig.tiers, quantity);
        if (tier) {
          const priceForTier = this.getPriceForQuantityTier(tier);
          materialPrice = priceForTier * quantity;
          materialDetails = {
            tier: { ...tier, price: priceForTier },
            priceForQuantity: materialPrice,
          };
          logger.info('Цена материала рассчитана', { priceForTier, quantity, materialPrice });
        } else {
          logger.warn('Не найден диапазон для материала', { quantity, tiers: materialPriceConfig.tiers });
        }
      } else {
        logger.warn('Не найдена конфигурация материала', {
          material_id: normalizedConfig.material_id,
          available: selectedSize.material_prices.map(m => m.material_id)
        });
      }
    }
    
    // 6. Рассчитываем цену отделки
    let finishingPrice = 0;
    const finishingDetails: SimplifiedPricingResult['finishingDetails'] = [];
    
    if (normalizedConfig.finishing && normalizedConfig.finishing.length > 0) {
      // Загружаем названия услуг из БД
      const serviceIds = normalizedConfig.finishing.map(f => f.service_id);
      const services = await db.all<Array<{ id: number; name: string }>>(
        `SELECT id, name FROM post_processing_services WHERE id IN (${serviceIds.map(() => '?').join(',')})`,
        serviceIds
      );
      const serviceNamesMap = new Map(services.map(s => [s.id, s.name]));
      
      for (const finConfig of normalizedConfig.finishing) {
        const finishingPriceConfig = selectedSize.finishing.find(f =>
          f.service_id === finConfig.service_id
        );
        
        if (finishingPriceConfig) {
          const tier = this.findTierForQuantity(finishingPriceConfig.tiers, quantity);
          if (tier) {
            const unitsPerItem = finConfig.units_per_item ?? finishingPriceConfig.units_per_item ?? 1;
            const totalUnits = quantity * unitsPerItem;
            const priceForTier = this.getPriceForQuantityTier(tier);
            
            let servicePrice = 0;
            if (finishingPriceConfig.price_unit === 'per_cut' || finConfig.price_unit === 'per_cut') {
              // Цена за единицу операции (рез/биг/фальц)
              servicePrice = priceForTier * totalUnits;
            } else {
              // Цена за изделие
              servicePrice = priceForTier * quantity;
            }
            
            finishingPrice += servicePrice;
            
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
    
    // 8. Загружаем названия материалов
    let materialName = `Material #${normalizedConfig.material_id}`;
    if (normalizedConfig.material_id) {
      const material = await db.get<{ name: string }>(
        `SELECT name FROM materials WHERE id = ?`,
        [normalizedConfig.material_id]
      );
      if (material) {
        materialName = material.name;
      }
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

