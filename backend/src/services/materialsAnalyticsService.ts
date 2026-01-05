import { getDb } from '../config/database'
import { logger } from '../utils/logger'

export interface MaterialAnalytics {
  materialId: number
  materialName: string
  category: string
  supplier: string
  currentStock: number
  minStock: number
  maxStock: number
  averageConsumption: number
  consumptionTrend: 'increasing' | 'decreasing' | 'stable'
  turnoverRate: number
  stockValue: number
  lastMovement: string
  movementCount: number
}

export interface ConsumptionAnalysis {
  materialId: number
  materialName: string
  dailyConsumption: number
  weeklyConsumption: number
  monthlyConsumption: number
  peakDays: string[]
  lowDays: string[]
  seasonalPattern: boolean
  forecastConsumption: number
}

export interface SupplierAnalytics {
  supplierId: number
  supplierName: string
  materialCount: number
  totalValue: number
  averagePrice: number
  deliveryReliability: number
  lastDelivery: string
  nextDelivery: string
  performanceScore: number
}

export interface CategoryAnalytics {
  categoryId: number
  categoryName: string
  materialCount: number
  totalValue: number
  averageConsumption: number
  topMaterials: Array<{
    materialId: number
    materialName: string
    consumption: number
  }>
}

export interface AnalyticsReport {
  summary: {
    totalMaterials: number
    totalValue: number
    lowStockCount: number
    outOfStockCount: number
    averageTurnover: number
  }
  materials: MaterialAnalytics[]
  consumption: ConsumptionAnalysis[]
  suppliers: SupplierAnalytics[]
  categories: CategoryAnalytics[]
  trends: {
    stockTrend: 'increasing' | 'decreasing' | 'stable'
    consumptionTrend: 'increasing' | 'decreasing' | 'stable'
    valueTrend: 'increasing' | 'decreasing' | 'stable'
  }
  recommendations: string[]
}

export class MaterialsAnalyticsService {
  /**
   * Получить полную аналитику по материалам
   */
  static async getFullAnalytics(): Promise<AnalyticsReport> {
    try {
      const db = await getDb()
      
      // Получаем базовую информацию о материалах
      const materials = await db.all(`
        SELECT 
          m.id,
          m.name,
          m.quantity,
          m.min_quantity,
          m.sheet_price_single,
          c.name as category_name,
          s.name as supplier_name,
          s.id as supplier_id,
          c.id as category_id
        FROM materials m
        LEFT JOIN material_categories c ON c.id = m.category_id
        LEFT JOIN suppliers s ON s.id = m.supplier_id
        ORDER BY m.name
      `)

      // Получаем движения материалов за последние 30 дней
      const movements = await db.all(`
        SELECT 
          materialId,
          SUM(CASE WHEN delta < 0 THEN ABS(delta) ELSE 0 END) as consumption,
          COUNT(*) as movement_count,
          MAX(created_at) as last_movement
        FROM material_moves
        WHERE created_at >= datetime('now', '-30 days')
        GROUP BY materialId
      `)

      // Создаем мапу движений для быстрого поиска
      const movementsMap = new Map()
      movements.forEach(movement => {
        movementsMap.set(movement.materialId, movement)
      })

      // Анализируем материалы
      const materialAnalytics: MaterialAnalytics[] = materials.map((material: any) => {
        const movement = movementsMap.get(material.id)
        const consumption = movement?.consumption || 0
        const movementCount = movement?.movement_count || 0
        const lastMovement = movement?.last_movement || null

        // Рассчитываем тренд потребления (упрощенный)
        const consumptionTrend = this.calculateConsumptionTrend(consumption, material.quantity)
        
        // Рассчитываем оборачиваемость
        const turnoverRate = material.quantity > 0 ? consumption / material.quantity : 0
        
        // Рассчитываем стоимость запаса
        const stockValue = material.quantity * (material.sheet_price_single || 0)

        return {
          materialId: material.id,
          materialName: material.name,
          category: material.category_name || 'Не указана',
          supplier: material.supplier_name || 'Не указан',
          currentStock: material.quantity,
          minStock: material.min_quantity || 0,
          maxStock: material.quantity * 2, // Упрощенный расчет
          averageConsumption: consumption / 30, // Среднее потребление в день
          consumptionTrend,
          turnoverRate,
          stockValue,
          lastMovement: lastMovement || 'Нет движений',
          movementCount
        }
      })

      // Анализируем потребление
      const consumptionAnalysis = await this.analyzeConsumption()

      // Анализируем поставщиков
      const supplierAnalytics = await this.analyzeSuppliers()

      // Анализируем категории
      const categoryAnalytics = await this.analyzeCategories()

      // Рассчитываем тренды
      const trends = this.calculateTrends(materialAnalytics)

      // Генерируем рекомендации
      const recommendations = this.generateRecommendations(materialAnalytics, consumptionAnalysis)

      // Создаем сводку
      const summary = {
        totalMaterials: materials.length,
        totalValue: materialAnalytics.reduce((sum, m) => sum + m.stockValue, 0),
        lowStockCount: materialAnalytics.filter(m => m.currentStock <= m.minStock).length,
        outOfStockCount: materialAnalytics.filter(m => m.currentStock === 0).length,
        averageTurnover: materialAnalytics.reduce((sum, m) => sum + m.turnoverRate, 0) / materialAnalytics.length
      }

      logger.info('Аналитика материалов сгенерирована', {
        totalMaterials: summary.totalMaterials,
        totalValue: summary.totalValue,
        lowStockCount: summary.lowStockCount
      })

      return {
        summary,
        materials: materialAnalytics,
        consumption: consumptionAnalysis,
        suppliers: supplierAnalytics,
        categories: categoryAnalytics,
        trends,
        recommendations
      }

    } catch (error: any) {
      logger.error('Ошибка генерации аналитики материалов', error)
      throw error
    }
  }

  /**
   * Анализировать потребление материалов
   */
  private static async analyzeConsumption(): Promise<ConsumptionAnalysis[]> {
    const db = await getDb()
    
    try {
      // Получаем потребление по дням за последние 30 дней
      const dailyConsumption = await db.all(`
        SELECT 
          materialId,
          DATE(created_at) as date,
          SUM(ABS(delta)) as daily_consumption
        FROM material_moves
        WHERE delta < 0 AND created_at >= datetime('now', '-30 days')
        GROUP BY materialId, DATE(created_at)
        ORDER BY materialId, date
      `)

      // Группируем по материалам
      const consumptionByMaterial = new Map()
      dailyConsumption.forEach(record => {
        if (!consumptionByMaterial.has(record.materialId)) {
          consumptionByMaterial.set(record.materialId, [])
        }
        consumptionByMaterial.get(record.materialId).push({
          date: record.date,
          consumption: record.daily_consumption
        })
      })

      // Анализируем каждый материал
      const analysis: ConsumptionAnalysis[] = []
      
      for (const [materialId, records] of consumptionByMaterial) {
        const consumptions = records.map((r: any) => r.consumption)
        const dailyConsumption = consumptions.reduce((sum: number, c: number) => sum + c, 0) / consumptions.length
        const weeklyConsumption = dailyConsumption * 7
        const monthlyConsumption = dailyConsumption * 30

        // Находим пиковые и низкие дни
        const sortedConsumptions = [...consumptions].sort((a, b) => b - a)
        const peakThreshold = sortedConsumptions[Math.floor(sortedConsumptions.length * 0.2)]
        const lowThreshold = sortedConsumptions[Math.floor(sortedConsumptions.length * 0.8)]

        const peakDays = records
          .filter((r: any) => r.consumption >= peakThreshold)
          .map((r: any) => r.date)
        
        const lowDays = records
          .filter((r: any) => r.consumption <= lowThreshold)
          .map((r: any) => r.date)

        // Простой прогноз потребления
        const forecastConsumption = dailyConsumption * 1.1 // +10% к текущему потреблению

        analysis.push({
          materialId,
          materialName: `Материал ${materialId}`, // Здесь можно получить название из БД
          dailyConsumption,
          weeklyConsumption,
          monthlyConsumption,
          peakDays,
          lowDays,
          seasonalPattern: false, // Упрощенная логика
          forecastConsumption
        })
      }

      return analysis
    } catch (error: any) {
      logger.error('Ошибка анализа потребления', error)
      return []
    }
  }

  /**
   * Анализировать поставщиков
   */
  private static async analyzeSuppliers(): Promise<SupplierAnalytics[]> {
    const db = await getDb()
    
    try {
      const suppliers = await db.all(`
        SELECT 
          s.id,
          s.name,
          COUNT(m.id) as material_count,
          SUM(m.quantity * m.sheet_price_single) as total_value,
          AVG(m.sheet_price_single) as average_price,
          MAX(m.created_at) as last_delivery
        FROM suppliers s
        LEFT JOIN materials m ON m.supplier_id = s.id
        GROUP BY s.id, s.name
      `)

      return suppliers.map((supplier: any) => ({
        supplierId: supplier.id,
        supplierName: supplier.name,
        materialCount: supplier.material_count || 0,
        totalValue: supplier.total_value || 0,
        averagePrice: supplier.average_price || 0,
        deliveryReliability: 0.85, // Упрощенный расчет
        lastDelivery: supplier.last_delivery || 'Нет поставок',
        nextDelivery: 'Не запланировано', // Упрощенная логика
        performanceScore: 0.8 // Упрощенный расчет
      }))
    } catch (error: any) {
      logger.error('Ошибка анализа поставщиков', error)
      return []
    }
  }

  /**
   * Анализировать категории
   */
  private static async analyzeCategories(): Promise<CategoryAnalytics[]> {
    const db = await getDb()
    
    try {
      const categories = await db.all(`
        SELECT 
          c.id,
          c.name,
          COUNT(m.id) as material_count,
          SUM(m.quantity * m.sheet_price_single) as total_value
        FROM material_categories c
        LEFT JOIN materials m ON m.category_id = c.id
        GROUP BY c.id, c.name
      `)

      return categories.map((category: any) => ({
        categoryId: category.id,
        categoryName: category.name,
        materialCount: category.material_count || 0,
        totalValue: category.total_value || 0,
        averageConsumption: 0, // Упрощенный расчет
        topMaterials: [] // Упрощенная логика
      }))
    } catch (error: any) {
      logger.error('Ошибка анализа категорий', error)
      return []
    }
  }

  /**
   * Рассчитать тренд потребления
   */
  private static calculateConsumptionTrend(consumption: number, currentStock: number): 'increasing' | 'decreasing' | 'stable' {
    if (consumption === 0) return 'stable'
    if (currentStock === 0) return 'increasing'
    
    const ratio = consumption / currentStock
    if (ratio > 0.1) return 'increasing'
    if (ratio < 0.05) return 'decreasing'
    return 'stable'
  }

  /**
   * Рассчитать тренды
   */
  private static calculateTrends(materials: MaterialAnalytics[]): {
    stockTrend: 'increasing' | 'decreasing' | 'stable'
    consumptionTrend: 'increasing' | 'decreasing' | 'stable'
    valueTrend: 'increasing' | 'decreasing' | 'stable'
  } {
    // Упрощенная логика расчета трендов
    const increasingTrends = materials.filter(m => m.consumptionTrend === 'increasing').length
    const totalMaterials = materials.length
    
    const stockTrend = increasingTrends > totalMaterials * 0.6 ? 'increasing' : 
                      increasingTrends < totalMaterials * 0.4 ? 'decreasing' : 'stable'
    
    return {
      stockTrend,
      consumptionTrend: stockTrend,
      valueTrend: 'stable' // Упрощенная логика
    }
  }

  /**
   * Генерировать рекомендации
   */
  private static generateRecommendations(
    materials: MaterialAnalytics[],
    consumption: ConsumptionAnalysis[]
  ): string[] {
    const recommendations: string[] = []

    // Рекомендации по низким остаткам
    const lowStockMaterials = materials.filter(m => m.currentStock <= m.minStock)
    if (lowStockMaterials.length > 0) {
      recommendations.push(`Необходимо пополнить ${lowStockMaterials.length} материалов с низким остатком`)
    }

    // Рекомендации по высокой оборачиваемости
    const highTurnoverMaterials = materials.filter(m => m.turnoverRate > 0.5)
    if (highTurnoverMaterials.length > 0) {
      recommendations.push(`Рассмотрите увеличение запасов для ${highTurnoverMaterials.length} быстро расходуемых материалов`)
    }

    // Рекомендации по неиспользуемым материалам
    const unusedMaterials = materials.filter(m => m.movementCount === 0)
    if (unusedMaterials.length > 0) {
      recommendations.push(`Рассмотрите списание ${unusedMaterials.length} неиспользуемых материалов`)
    }

    // Рекомендации по стоимости
    const highValueMaterials = materials.filter(m => m.stockValue > 1000)
    if (highValueMaterials.length > 0) {
      recommendations.push(`Оптимизируйте запасы ${highValueMaterials.length} дорогостоящих материалов`)
    }

    return recommendations
  }

  /**
   * Получить аналитику по конкретному материалу
   */
  static async getMaterialAnalytics(materialId: number): Promise<MaterialAnalytics | null> {
    try {
      const db = await getDb()
      
      const material = await db.get(`
        SELECT 
          m.id,
          m.name,
          m.quantity,
          m.min_quantity,
          m.sheet_price_single,
          c.name as category_name,
          s.name as supplier_name
        FROM materials m
        LEFT JOIN material_categories c ON c.id = m.category_id
        LEFT JOIN suppliers s ON s.id = m.supplier_id
        WHERE m.id = ?
      `, materialId)

      if (!material) return null

      // Получаем движения за последние 30 дней
      const movements = await db.all(`
        SELECT 
          SUM(CASE WHEN delta < 0 THEN ABS(delta) ELSE 0 END) as consumption,
          COUNT(*) as movement_count,
          MAX(created_at) as last_movement
        FROM material_moves
        WHERE materialId = ? AND created_at >= datetime('now', '-30 days')
      `, materialId)

      const movement = movements[0]
      const consumption = movement?.consumption || 0
      const movementCount = movement?.movement_count || 0
      const lastMovement = movement?.last_movement || null

      return {
        materialId: material.id,
        materialName: material.name,
        category: material.category_name || 'Не указана',
        supplier: material.supplier_name || 'Не указан',
        currentStock: material.quantity,
        minStock: material.min_quantity || 0,
        maxStock: material.quantity * 2,
        averageConsumption: consumption / 30,
        consumptionTrend: this.calculateConsumptionTrend(consumption, material.quantity),
        turnoverRate: material.quantity > 0 ? consumption / material.quantity : 0,
        stockValue: material.quantity * (material.sheet_price_single || 0),
        lastMovement: lastMovement || 'Нет движений',
        movementCount
      }
    } catch (error: any) {
      logger.error('Ошибка получения аналитики материала', error)
      return null
    }
  }
}
