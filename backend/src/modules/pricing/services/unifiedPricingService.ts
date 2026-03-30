/**
 * Единый сервис ценообразования (simplified-only).
 *
 * В текущей архитектуре расчёт поддерживается только для продуктов
 * с calculator_type='simplified'.
 */

import { getDb } from '../../../db';
import { SimplifiedPricingService } from './simplifiedPricingService';
import type { ProductSize } from './layoutCalculationService';
import { logger } from '../../../utils/logger';

export interface UnifiedPricingResult {
  productId: number;
  productName: string;
  quantity: number;
  
  // Размеры и раскладка
  productSize: ProductSize;
  layout: any;
  sheetsNeeded?: number; // 📄 Количество листов для печати
  metersNeeded?: number; // 📏 Погонные метры для рулонной печати
  itemsPerSheet?: number; // 📐 Укладка: сколько изделий на лист
  cutsPerSheet?: number; // 🔪 Количество резов на лист
  numberOfStacks?: number; // 📚 Количество стоп для резки
  
  // Стоимость
  materials: Array<{
    materialId: number;
    materialName: string;
    quantity: number;
    unitPrice: number;
    totalCost: number;
    density?: number; // 🆕 Плотность материала
    paper_type_name?: string; // 🆕 display_name типа бумаги для установки materialType на фронтенде
    /** Расходник отделки (DTF и т.д.): деньги в строках операций, не в отдельной позиции материала */
    isConsumableOnly?: boolean;
  }>;
  operations: Array<{
    operationId: number;
    operationName: string;
    operationType: string;
    priceUnit: string;
    unitPrice: number;
    quantity: number;
    setupCost: number;
    totalCost: number;
    appliedRules?: string[];
    pricingSource?: string;
    pricingKey?: string;
    technologyCode?: string;
  }>;
  
  // Итоги
  materialCost: number;
  operationsCost: number;
  setupCosts: number;
  subtotal: number;
  
  markup: number;
  discountPercent: number;
  discountAmount: number;
  
  finalPrice: number;
  pricePerUnit: number;
  /** Цены по диапазонам тиража для выбранной конфигурации. total_price — фактическая сумма (совпадает с finalPrice для текущего qty) */
  tier_prices?: Array<{ min_qty: number; max_qty?: number; unit_price: number; total_price?: number }>;
  
  // Метаданные
  calculatedAt: string;
  calculationMethod: 'simplified';
  /** Предупреждения (например: формат не помещается на лист) */
  warnings?: string[];
  breakdown?: {
    coverPrice: number;
    innerBlockPrice: number;
    bindingPrice: number;
    otherFinishingPrice: number;
  };
}

export class UnifiedPricingService {
  /**
   * 🎯 Главный метод расчета цены
   * Это единственный метод, который должен использоваться для расчета цен!
   */
  static async calculatePrice(
    productId: number,
    configuration: any,
    quantity: number
  ): Promise<UnifiedPricingResult> {
    logger.info('💰 UnifiedPricingService: начало расчета', { productId, quantity });

    try {
      const db = await getDb();
      const product = await db.get<{ calculator_type?: string | null }>(
        `SELECT calculator_type FROM products WHERE id = ?`,
        [productId]
      );

      if (!product) {
        throw new Error('Product not found');
      }

      if (product.calculator_type === 'simplified') {
        logger.info('✨ Используется SimplifiedPricingService (упрощённый калькулятор)', { productId });
        return await this.calculateViaSimplifiedSystem(productId, configuration, quantity);
      }

      const err: any = new Error(
        'Расчёт доступен только для simplified-продуктов. Мигрируйте шаблон продукта.'
      );
      err.status = 422;
      throw err;
    } catch (error) {
      logger.error('❌ Ошибка расчета цены', { productId, error });
      throw error;
    }
  }

  /**
   * Расчет через упрощённую систему (прямые цены из config_data.simplified)
   */
  private static async calculateViaSimplifiedSystem(
    productId: number,
    configuration: any,
    quantity: number
  ): Promise<UnifiedPricingResult> {
    const result = await SimplifiedPricingService.calculatePrice(
      productId,
      configuration,
      quantity
    );
    
    // Преобразуем SimplifiedPricingResult в UnifiedPricingResult
    return {
      productId: result.productId,
      productName: result.productName,
      quantity: result.quantity,
      productSize: result.selectedSize ? {
        width: result.selectedSize.width_mm,
        height: result.selectedSize.height_mm,
      } : { width: 0, height: 0 },
      layout: result.layout ? {
        fitsOnSheet: result.layout.fitsOnSheet,
        itemsPerSheet: result.layout.itemsPerSheet,
        sheetsNeeded: result.layout.sheetsNeeded,
        metersNeeded: result.layout.metersNeeded,
        wastePercentage: result.layout.wastePercentage,
        recommendedSheetSize: result.layout.recommendedSheetSize,
        cutsPerSheet: (result.layout as any).cutsPerSheet,
      } : {},
      sheetsNeeded: result.layout?.sheetsNeeded,
      metersNeeded: result.layout?.metersNeeded,
      warnings: result.warnings,
      materials: [
        ...(result.selectedMaterial ? [{
          materialId: result.selectedMaterial.material_id,
          materialName: result.selectedMaterial.material_name,
          quantity: result.layout?.metersNeeded ?? result.layout?.sheetsNeeded ?? result.quantity,
          unitPrice: result.materialDetails?.tier.price || 0,
          totalCost: result.materialDetails?.priceForQuantity ?? result.materialPrice,
          density: result.selectedMaterial.density,
          paper_type_name: result.selectedMaterial.paper_type_name,
        }] : []),
        ...(result.selectedBaseMaterial ? [{
          materialId: result.selectedBaseMaterial.material_id,
          materialName: result.selectedBaseMaterial.material_name,
          quantity: result.quantity,
          unitPrice: result.baseMaterialDetails?.tier.price || 0,
          totalCost: result.baseMaterialDetails?.priceForQuantity ?? 0,
        }] : []),
        ...(result.operationMaterials?.map((om) => ({
          materialId: om.material_id,
          materialName: om.material_name,
          quantity: om.quantity,
          unitPrice: 0,
          totalCost: 0,
          isConsumableOnly: true,
        })) ?? []),
      ],
      operations: [
        ...(result.printDetails ? [{
          operationId: 0,
          operationName: 'Печать',
          operationType: 'print',
          priceUnit: 'per_item' as const,
          unitPrice: result.printDetails.tier.price,
          quantity: result.quantity,
          setupCost: 0,
          totalCost: result.printPrice,
          appliedRules: undefined,
          pricingSource: 'simplified',
          pricingKey: 'print',
          technologyCode: result.selectedPrint?.technology_code,
        }] : []),
        ...(result.finishingDetails?.map(f => ({
          operationId: f.service_id,
          operationName: f.service_name,
          operationType: ((f as any).operation_type || 'other') as any,
          priceUnit: ((f as any).price_unit ?? result.selectedFinishing?.find((sf: any) => sf.service_id === f.service_id)?.price_unit) || 'per_item' as const,
          unitPrice: f.tier.price,
          quantity: f.units_needed,
          setupCost: 0,
          totalCost: f.priceForQuantity,
          appliedRules: undefined,
          pricingSource: 'simplified',
          pricingKey: `service:${f.service_id}`,
          technologyCode: undefined,
        })) || []),
      ],
      materialCost: result.materialPrice,
      operationsCost: result.printPrice + result.finishingPrice,
      setupCosts: 0,
      subtotal: result.subtotal,
      markup: 0, // В упрощённом калькуляторе наценки уже учтены
      discountPercent: 0,
      discountAmount: 0,
      finalPrice: result.finalPrice,
      pricePerUnit: result.pricePerUnit,
      ...(result.tier_prices && result.tier_prices.length > 0 ? { tier_prices: result.tier_prices } : {}),
      ...(result.breakdown ? { breakdown: result.breakdown } : {}),
      calculatedAt: result.calculatedAt,
      calculationMethod: 'simplified',
    };
  }
}

