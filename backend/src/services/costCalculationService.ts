import { getDb } from '../config/database'
import { logger } from '../utils/logger'

export interface MaterialCost {
  materialId: number
  materialName: string
  quantity: number
  unitPrice: number
  totalCost: number
  unit: string
}

export interface ServiceCost {
  serviceId: number
  serviceName: string
  quantity: number
  unitPrice: number
  totalCost: number
  unit: string
}

export interface ProductCostBreakdown {
  productId: string
  productName: string
  materialCosts: MaterialCost[]
  serviceCosts: ServiceCost[]
  totalMaterialCost: number
  totalServiceCost: number
  totalCost: number
  margin: number
  sellingPrice: number
  profit: number
  profitMargin: number
}

export interface CostCalculationResult {
  success: boolean
  breakdown: ProductCostBreakdown
  recommendations: string[]
  warnings: string[]
}

export class CostCalculationService {
  /**
   * Рассчитать себестоимость товара
   */
  static async calculateProductCost(
    productType: string,
    productVariant: string,
    quantity: number,
    specifications?: any
  ): Promise<CostCalculationResult> {
    try {
      const db = await getDb()
      
      // Получаем материалы для продукта
      const materialCosts = await this.getMaterialCosts(productType, productVariant, quantity, specifications)
      
      // Получаем услуги для продукта
      const serviceCosts = await this.getServiceCosts(productType, productVariant, quantity, specifications)
      
      // Рассчитываем общие затраты
      const totalMaterialCost = materialCosts.reduce((sum, cost) => sum + cost.totalCost, 0)
      const totalServiceCost = serviceCosts.reduce((sum, cost) => sum + cost.totalCost, 0)
      const totalCost = totalMaterialCost + totalServiceCost
      
      // Получаем текущую цену продажи
      const sellingPrice = await this.getSellingPrice(productType, productVariant)
      
      // Рассчитываем прибыль и маржу
      const profit = sellingPrice - totalCost
      const profitMargin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0
      const margin = sellingPrice > 0 ? ((sellingPrice - totalCost) / totalCost) * 100 : 0
      
      const breakdown: ProductCostBreakdown = {
        productId: `${productType}_${productVariant}`,
        productName: `${productType} ${productVariant}`,
        materialCosts,
        serviceCosts,
        totalMaterialCost,
        totalServiceCost,
        totalCost,
        margin,
        sellingPrice,
        profit,
        profitMargin
      }
      
      // Генерируем рекомендации и предупреждения
      const recommendations = this.generateRecommendations(breakdown)
      const warnings = this.generateWarnings(breakdown)
      
      logger.info('Рассчитана себестоимость товара', {
        productType,
        productVariant,
        quantity,
        totalCost,
        profit,
        profitMargin
      })
      
      return {
        success: true,
        breakdown,
        recommendations,
        warnings
      }
      
    } catch (error: any) {
      logger.error('Ошибка расчета себестоимости', error)
      return {
        success: false,
        breakdown: {} as ProductCostBreakdown,
        recommendations: [],
        warnings: [`Ошибка расчета: ${error.message}`]
      }
    }
  }

  /**
   * Получить затраты на материалы
   */
  private static async getMaterialCosts(
    productType: string,
    productVariant: string,
    quantity: number,
    specifications?: any
  ): Promise<MaterialCost[]> {
    const db = await getDb()
    const materialCosts: MaterialCost[] = []
    
    try {
      // Получаем материалы для продукта
      const materials = await db.all(`
        SELECT 
          pm.materialId,
          m.name as materialName,
          pm.qtyPerItem,
          m.sheet_price_single as unitPrice,
          m.unit
        FROM product_materials pm
        JOIN materials m ON m.id = pm.materialId
        WHERE pm.presetCategory = ? AND pm.presetDescription = ?
      `, productType, productVariant)
      
      for (const material of materials) {
        const materialQuantity = material.qtyPerItem * quantity
        const totalCost = materialQuantity * material.unitPrice
        
        materialCosts.push({
          materialId: material.materialId,
          materialName: material.materialName,
          quantity: materialQuantity,
          unitPrice: material.unitPrice,
          totalCost,
          unit: material.unit
        })
      }
      
      // Если нет материалов в базе, используем базовые расчеты
      if (materialCosts.length === 0) {
        materialCosts.push(...this.getDefaultMaterialCosts(productType, quantity, specifications))
      }
      
    } catch (error: any) {
      logger.warn('Ошибка получения затрат на материалы, используем базовые расчеты', error)
      materialCosts.push(...this.getDefaultMaterialCosts(productType, quantity, specifications))
    }
    
    return materialCosts
  }

  /**
   * Получить затраты на услуги
   */
  private static async getServiceCosts(
    productType: string,
    productVariant: string,
    quantity: number,
    specifications?: any
  ): Promise<ServiceCost[]> {
    const db = await getDb()
    const serviceCosts: ServiceCost[] = []
    
    try {
      // Получаем услуги для продукта
      const services = await db.all(`
        SELECT 
          ps.serviceId,
          s.name as serviceName,
          ps.qtyPerItem,
          s.price as unitPrice,
          s.unit
        FROM product_services ps
        JOIN services s ON s.id = ps.serviceId
        WHERE ps.productType = ? AND ps.productVariant = ?
      `, productType, productVariant)
      
      for (const service of services) {
        const serviceQuantity = service.qtyPerItem * quantity
        const totalCost = serviceQuantity * service.unitPrice
        
        serviceCosts.push({
          serviceId: service.serviceId,
          serviceName: service.serviceName,
          quantity: serviceQuantity,
          unitPrice: service.unitPrice,
          totalCost,
          unit: service.unit
        })
      }
      
    } catch (error: any) {
      logger.warn('Ошибка получения затрат на услуги', error)
    }
    
    // Если нет услуг в базе, добавляем базовые услуги
    if (serviceCosts.length === 0) {
      serviceCosts.push({
        serviceId: 1,
        serviceName: 'Печать',
        quantity: quantity,
        unitPrice: 0.05, // 0.05 BYN за штуку
        totalCost: quantity * 0.05,
        unit: 'шт'
      })
    }
    
    return serviceCosts
  }

  /**
   * Получить цену продажи
   */
  private static async getSellingPrice(productType: string, productVariant: string): Promise<number> {
    const db = await getDb()
    
    try {
      // Сначала пробуем получить цену из base_prices
      const priceData = await db.get(`
        SELECT online_price, urgent_price, promo_price
        FROM base_prices
        WHERE product_type = ? AND product_variant = ?
      `, productType, productVariant)
      
      if (priceData && priceData.online_price > 0) {
        return priceData.online_price
      }
      
      // Если нет в base_prices, используем базовые цены в белорусских рублях
      const basePrices: { [key: string]: { [key: string]: number } } = {
        'flyers': {
          'A4': 15.0,  // 15 BYN за 100 листовок A4
          'A5': 8.0,   // 8 BYN за 100 листовок A5
          'A6': 5.0    // 5 BYN за 100 листовок A6
        },
        'business-cards': {
          'A4': 25.0,  // 25 BYN за 100 визиток
          'A5': 15.0
        },
        'posters': {
          'A3': 30.0,  // 30 BYN за 100 плакатов A3
          'A2': 50.0   // 50 BYN за 100 плакатов A2
        }
      }
      
      return basePrices[productType]?.[productVariant] || 20.0 // Базовая цена 20 BYN
      
    } catch (error: any) {
      logger.warn('Ошибка получения цены продажи', error)
    }
    
    return 20.0 // Базовая цена 20 BYN
  }

  /**
   * Получить базовую цену материала
   */
  private static getDefaultMaterialPrice(materialName: string, productType: string): number {
    // Базовые цены в белорусских рублях
    const basePrices: { [key: string]: number } = {
      'Color Copy 100г/м² SRA3': 0.28,
      'NEVIA 90г/м² SRA3': 0.13,
      'NEVIA 128г/м² SRA3': 0.15,
      'NEVIA 150г/м² SRA3': 0.18,
      'NEVIA 170г/м² SRA3': 0.20,
      'NEVIA 300г/м² SRA3': 0.35,
      'NEVIA 350г/м² SRA3': 0.40,
      'Color Copy 90г/м² SRA3': 0.12,
      'Color Copy 120г/м² SRA3': 0.16,
      'Color Copy 220г/м² SRA3': 0.25,
      'Color Copy 280г/м² SRA3': 0.32,
      'Магнитная': 0.50,
      'Офсетная': 0.15,
      'Полуматовая': 0.20,
      'Самоклеящаяся': 0.30,
      'Крафт': 0.18,
      'Прозрачная': 0.35,
      'Рулонная': 0.25
    }
    
    return basePrices[materialName] || 0.20 // Базовая цена 0.20 BYN если материал не найден
  }

  /**
   * Получить базовые затраты на материалы
   */
  private static getDefaultMaterialCosts(
    productType: string,
    quantity: number,
    specifications?: any
  ): MaterialCost[] {
    const materialCosts: MaterialCost[] = []
    
    // Базовые расчеты для разных типов продуктов
    switch (productType) {
      case 'flyers':
        materialCosts.push({
          materialId: 1,
          materialName: 'Бумага SRA3',
          quantity: Math.ceil(quantity / 2), // Примерный расчет листов
          unitPrice: 0.05,
          totalCost: Math.ceil(quantity / 2) * 0.05,
          unit: 'лист'
        })
        break
        
      case 'business-cards':
        materialCosts.push({
          materialId: 2,
          materialName: 'Бумага для визиток',
          quantity: Math.ceil(quantity / 10), // 10 визиток на лист
          unitPrice: 0.08,
          totalCost: Math.ceil(quantity / 10) * 0.08,
          unit: 'лист'
        })
        break
        
      case 'posters':
        materialCosts.push({
          materialId: 3,
          materialName: 'Бумага A3',
          quantity: quantity,
          unitPrice: 0.15,
          totalCost: quantity * 0.15,
          unit: 'лист'
        })
        break
        
      default:
        materialCosts.push({
          materialId: 0,
          materialName: 'Базовый материал',
          quantity: quantity,
          unitPrice: 0.10,
          totalCost: quantity * 0.10,
          unit: 'шт'
        })
    }
    
    return materialCosts
  }

  /**
   * Генерировать рекомендации
   */
  private static generateRecommendations(breakdown: ProductCostBreakdown): string[] {
    const recommendations: string[] = []
    
    if (breakdown.profitMargin < 10) {
      recommendations.push('Низкая маржинальность - рассмотрите возможность повышения цены')
    }
    
    if (breakdown.totalMaterialCost > breakdown.totalServiceCost * 2) {
      recommendations.push('Высокие затраты на материалы - рассмотрите альтернативных поставщиков')
    }
    
    if (breakdown.margin > 200) {
      recommendations.push('Высокая маржинальность - можно снизить цену для привлечения клиентов')
    }
    
    if (breakdown.profitMargin > 50) {
      recommendations.push('Отличная маржинальность - продукт очень прибыльный')
    }
    
    return recommendations
  }

  /**
   * Генерировать предупреждения
   */
  private static generateWarnings(breakdown: ProductCostBreakdown): string[] {
    const warnings: string[] = []
    
    if (breakdown.profit < 0) {
      warnings.push('Убыточный продукт - себестоимость превышает цену продажи')
    }
    
    if (breakdown.profitMargin < 5) {
      warnings.push('Очень низкая маржинальность - риск убытков')
    }
    
    if (breakdown.totalCost === 0) {
      warnings.push('Не удалось рассчитать себестоимость - проверьте настройки материалов')
    }
    
    return warnings
  }

  /**
   * Получить историю расчетов себестоимости
   */
  static async getCostHistory(productId?: string, limit: number = 50): Promise<ProductCostBreakdown[]> {
    const db = await getDb()
    
    try {
      // Здесь можно добавить таблицу для хранения истории расчетов
      // Пока возвращаем пустой массив
      return []
    } catch (error: any) {
      logger.error('Ошибка получения истории расчетов', error)
      return []
    }
  }

  /**
   * Сравнить себестоимость разных вариантов продукта
   */
  static async compareProductVariants(
    productType: string,
    variants: string[],
    quantity: number
  ): Promise<{ variant: string; breakdown: ProductCostBreakdown }[]> {
    const comparisons = []
    
    for (const variant of variants) {
      const result = await this.calculateProductCost(productType, variant, quantity)
      if (result.success) {
        comparisons.push({
          variant,
          breakdown: result.breakdown
        })
      }
    }
    
    // Сортируем по прибыльности
    comparisons.sort((a, b) => b.breakdown.profit - a.breakdown.profit)
    
    return comparisons
  }
}
