/**
 * 🎯 ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ для ценообразования
 * 
 * Этот сервис является главным и единственным способом расчета цен в системе.
 * Все остальные сервисы (PricingService, RealPricingService) - DEPRECATED.
 * 
 * Используется:
 * - FlexiblePricingService - для операций (новая гибкая система)
 */

import { getDb } from '../../../db';
import { FlexiblePricingService } from './flexiblePricingService';
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
  
  // Метаданные
  calculatedAt: string;
  calculationMethod: 'flexible_operations' | 'fallback_legacy';
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
      // Проверяем и при необходимости создаём операции для продукта
      const hasOperations = await this.ensureProductHasOperations(productId);

      if (!hasOperations) {
        logger.error('❌ Для продукта не настроены операции, расчет невозможен', { productId });
        throw new Error('Для продукта не настроены операции ценообразования. Добавьте операции в админке и повторите расчет.');
      }

      logger.info('✨ Используется FlexiblePricingService (новая система)', { productId });
      return await this.calculateViaFlexibleSystem(productId, configuration, quantity);
    } catch (error) {
      logger.error('❌ Ошибка расчета цены', { productId, error });
      throw error;
    }
  }
  
  /**
   * Проверяет, есть ли у продукта связанные операции
   */
  private static async checkProductHasOperations(productId: number): Promise<boolean> {
    const db = await getDb();
    try {
      const result = await db.get(
        `SELECT COUNT(*) as count FROM product_operations_link WHERE product_id = ?`,
        [productId]
      );
      return (result?.count || 0) > 0;
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : '';
      if (message.includes('no such table')) {
        return false;
      }
      throw error;
    }
  }

  private static async ensureProductHasOperations(productId: number): Promise<boolean> {
    if (await this.checkProductHasOperations(productId)) {
      return true;
    }

    const db = await getDb();

    const product = await db.get<{
      id: number
      name: string
      product_type?: string | null
      calculator_type?: string | null
      category_name?: string | null
    }>(
      `SELECT p.id, p.name, p.product_type, p.calculator_type, pc.name as category_name
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       WHERE p.id = ?`,
      productId
    );

    if (!product) {
      logger.warn('Не удалось найти продукт при синхронизации операций', { productId });
      return false;
    }

    const resolvedProductType = this.resolveProductType(product);
    if (!resolvedProductType) {
      logger.warn('Не удалось определить тип продукта для автоматической привязки операций', {
        productId,
        productName: product.name,
        category: product.category_name,
      });
      return false;
    }

    // Не устанавливаем product_type в таблице products, используем только для поиска operation_norms
    // if (!product.product_type) {
    //   await db.run(`UPDATE products SET product_type = ? WHERE id = ?`, [resolvedProductType, productId]);
    // }

    // Ищем operation_norms по нескольким возможным типам
    const possibleTypes = [resolvedProductType];
    if (resolvedProductType === 'universal') {
      // Для universal также ищем flyers (листовки)
      possibleTypes.push('flyers');
    }
    if (resolvedProductType === 'business_cards') {
      // Для business_cards также ищем по имени продукта
      possibleTypes.push(product.name.toLowerCase());
    }

    const norms = await db.all<Array<{ operation: string; service_id: number; formula: string }>>(
      `SELECT operation, service_id, formula
       FROM operation_norms
       WHERE product_type IN (${possibleTypes.map(() => '?').join(',')}) AND is_active = 1
       ORDER BY CASE WHEN product_type = ? THEN 0 ELSE 1 END, id`,
      [...possibleTypes, resolvedProductType]
    );

    if (!norms.length) {
      logger.warn('Для типа продукта нет настроенных operation_norms', {
        productId,
        productType: resolvedProductType,
      });
      return false;
    }

    const existingLinks = await db.all<Array<{ operation_id: number }>>(
      `SELECT operation_id FROM product_operations_link WHERE product_id = ?`,
      productId
    );

    const existingOperationIds = new Set(existingLinks.map((link) => link.operation_id));

    let sequenceBase = await db.get<{ maxSequence: number }>(
      `SELECT COALESCE(MAX(sequence), 0) as maxSequence FROM product_operations_link WHERE product_id = ?`,
      productId
    );

    let nextSequence = (sequenceBase?.maxSequence ?? 0) + 1;
    let inserted = 0;

    for (const norm of norms) {
      if (existingOperationIds.has(norm.service_id)) {
        continue;
      }

      const isRequired = this.isRequiredOperation(norm.operation);

      await db.run(
        `INSERT INTO product_operations_link (
            product_id,
            operation_id,
            sequence,
            sort_order,
            is_required,
            is_default,
            price_multiplier,
            default_params,
            conditions
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productId,
          norm.service_id,
          nextSequence,
          nextSequence,
          isRequired ? 1 : 0,
          isRequired ? 1 : 0,
          1.0,
          null,
          null,
        ]
      );

      inserted += 1;
      nextSequence += 1;
    }

    if (inserted > 0) {
      logger.info('🔗 Автоматически добавлены операции для продукта', {
        productId,
        productType: resolvedProductType,
        inserted,
      });
    }

    return this.checkProductHasOperations(productId);
  }

  private static resolveProductType(product: {
    product_type?: string | null
    name: string
    category_name?: string | null
  }): string | null {
    if (product.product_type) {
      return product.product_type;
    }

    const candidates = [product.category_name, product.name];

    for (const value of candidates) {
      const mapped = this.mapNameToProductType(value);
      if (mapped) {
        return mapped;
      }
    }

    return null;
  }

  private static mapNameToProductType(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const lower = value.toLowerCase();

    // Карточные продукты
    if (lower.includes('визит') || lower.includes('бейдж') || lower.includes('карт')) {
      return 'business_cards';
    }

    // Многостраничные продукты
    if (lower.includes('буклет') || lower.includes('каталог') ||
        lower.includes('журнал') || lower.includes('книг') ||
        lower.includes('брошюр') || lower.includes('календар') ||
        lower.includes('тетрад') || lower.includes('блокнот') ||
        lower.includes('меню')) {
      return 'multi_page';
    }

    // Листовые продукты
    if (lower.includes('листов') || lower.includes('флаер') ||
        lower.includes('открыт') || lower.includes('пригла') ||
        lower.includes('плакат') || lower.includes('афиш')) {
      return 'sheet_single';
    }

    // Все остальное - универсальные
    return 'universal';
  }

  private static isRequiredOperation(operationLabel: string): boolean {
    const lower = operationLabel.toLowerCase();
    if (lower.includes('ламин') || lower.includes('скруг')) {
      return false;
    }
    return true;
  }
  
  /**
   * Расчет через новую гибкую систему операций
   */
  private static async calculateViaFlexibleSystem(
    productId: number,
    configuration: any,
    quantity: number
  ): Promise<UnifiedPricingResult> {
    const result = await FlexiblePricingService.calculatePrice(
      productId,
      configuration,
      quantity
    );
    
    return {
      ...result,
      calculatedAt: new Date().toISOString(),
      calculationMethod: 'flexible_operations'
    };
  }
}

