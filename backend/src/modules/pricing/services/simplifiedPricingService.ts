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
  // Массив цен для каждого тиража: [1x, 5x, 10x, 50x, 100x, 500x, 1000x, 1000-∞x]
  tier_prices?: number[];
  // Обратная совместимость - если tier_prices нет, используем price
  price?: number;
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
    
    // 3. Находим выбранный размер
    let selectedSize: SimplifiedSizeConfig | null = null;
    
    if (configuration.size_id) {
      selectedSize = simplifiedConfig.sizes.find(s => s.id === configuration.size_id) || null;
    } else if (configuration.trim_size) {
      // Ищем по размерам (примерное совпадение с допуском ±1мм)
      selectedSize = simplifiedConfig.sizes.find(s => 
        Math.abs(s.width_mm - configuration.trim_size!.width) <= 1 &&
        Math.abs(s.height_mm - configuration.trim_size!.height) <= 1
      ) || null;
    }
    
    if (!selectedSize) {
      throw new Error('Selected size not found in simplified config');
    }
    
    // 4. Рассчитываем цену печати
    let printPrice = 0;
    let printDetails: SimplifiedPricingResult['printDetails'] | undefined;
    
    if (configuration.print_technology && configuration.print_color_mode && configuration.print_sides_mode) {
      const printPriceConfig = selectedSize.print_prices.find(p =>
        p.technology_code === configuration.print_technology &&
        p.color_mode === configuration.print_color_mode &&
        p.sides_mode === configuration.print_sides_mode
      );
      
      if (printPriceConfig) {
        const tier = this.findTierForQuantity(printPriceConfig.tiers, quantity);
        if (tier) {
          // Определяем цену для конкретного тиража из tier_prices
          const priceForTier = this.getPriceForQuantityTier(tier, quantity);
          printPrice = priceForTier * quantity;
          printDetails = {
            tier: { ...tier, price: priceForTier },
            priceForQuantity: printPrice,
          };
        }
      }
    }
    
    // 5. Рассчитываем цену материала
    let materialPrice = 0;
    let materialDetails: SimplifiedPricingResult['materialDetails'] | undefined;
    
    if (configuration.material_id) {
      const materialPriceConfig = selectedSize.material_prices.find(m => m.material_id === configuration.material_id);
      
      if (materialPriceConfig) {
        const tier = this.findTierForQuantity(materialPriceConfig.tiers, quantity);
        if (tier) {
          const priceForTier = this.getPriceForQuantityTier(tier, quantity);
          materialPrice = priceForTier * quantity;
          materialDetails = {
            tier: { ...tier, price: priceForTier },
            priceForQuantity: materialPrice,
          };
        }
      }
    }
    
    // 6. Рассчитываем цену отделки
    let finishingPrice = 0;
    const finishingDetails: SimplifiedPricingResult['finishingDetails'] = [];
    
    if (configuration.finishing && configuration.finishing.length > 0) {
      // Загружаем названия услуг из БД
      const serviceIds = configuration.finishing.map(f => f.service_id);
      const services = await db.all<Array<{ id: number; name: string }>>(
        `SELECT id, name FROM post_processing_services WHERE id IN (${serviceIds.map(() => '?').join(',')})`,
        serviceIds
      );
      const serviceNamesMap = new Map(services.map(s => [s.id, s.name]));
      
      for (const finConfig of configuration.finishing) {
        const finishingPriceConfig = selectedSize.finishing.find(f =>
          f.service_id === finConfig.service_id
        );
        
        if (finishingPriceConfig) {
          const tier = this.findTierForQuantity(finishingPriceConfig.tiers, quantity);
          if (tier) {
            const unitsPerItem = finConfig.units_per_item ?? finishingPriceConfig.units_per_item ?? 1;
            const totalUnits = quantity * unitsPerItem;
            const priceForTier = this.getPriceForQuantityTier(tier, quantity);
            
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
    
    // 8. Загружаем названия материалов
    let materialName = `Material #${configuration.material_id}`;
    if (configuration.material_id) {
      const material = await db.get<{ name: string }>(
        `SELECT name FROM materials WHERE id = ?`,
        [configuration.material_id]
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
      selectedPrint: configuration.print_technology && configuration.print_color_mode && configuration.print_sides_mode ? {
        technology_code: configuration.print_technology,
        color_mode: configuration.print_color_mode,
        sides_mode: configuration.print_sides_mode,
      } : undefined,
      selectedMaterial: configuration.material_id ? {
        material_id: configuration.material_id,
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
    
    for (const tier of sortedTiers) {
      if (quantity >= tier.min_qty) {
        if (tier.max_qty === undefined || quantity <= tier.max_qty) {
          return tier;
        }
      }
    }
    
    // Если не нашли, возвращаем первый (самый дешёвый)
    if (tiers.length > 0) {
      return tiers[0];
    }
    
    return null;
  }
  
  /**
   * Определяет цену для конкретного тиража (1, 5, 10, 50, 100, 500, 1000, 1000+)
   * на основе tier_prices массива или старого поля price
   */
  private static getPriceForQuantityTier(
    tier: SimplifiedQtyTier,
    quantity: number
  ): number {
    // Если есть tier_prices, используем его
    if (tier.tier_prices && tier.tier_prices.length > 0) {
      // Определяем индекс тиража: 1->0, 5->1, 10->2, 50->3, 100->4, 500->5, 1000->6, 1000+->7
      let tierIndex = 7; // По умолчанию 1000-∞
      
      if (quantity >= 1000) {
        tierIndex = 7; // 1000-∞
      } else if (quantity >= 500) {
        tierIndex = 6; // 1000x
      } else if (quantity >= 100) {
        tierIndex = 5; // 500x
      } else if (quantity >= 50) {
        tierIndex = 4; // 100x
      } else if (quantity >= 10) {
        tierIndex = 3; // 50x
      } else if (quantity >= 5) {
        tierIndex = 2; // 10x
      } else if (quantity >= 1) {
        tierIndex = 1; // 5x
      } else {
        tierIndex = 0; // 1x
      }
      
      // Используем цену для выбранного тиража, или первую доступную
      return tier.tier_prices[tierIndex] ?? tier.tier_prices[0] ?? 0;
    }
    
    // Обратная совместимость: используем price если tier_prices нет
    return tier.price ?? 0;
  }
}

