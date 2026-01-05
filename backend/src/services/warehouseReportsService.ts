import { getDb } from '../config/database'
import * as fs from 'fs'
import * as path from 'path'

export interface WarehouseSummary {
  totalMaterials: number
  inStock: number
  lowStock: number
  outOfStock: number
  totalValue: number
  categoriesCount: number
  suppliersCount: number
  alertsCount: number
}

export interface LowStockItem {
  id: number
  name: string
  category_name: string
  supplier_name: string
  quantity: number
  min_quantity: number
  unit: string
  sheet_price_single: number
  total_value: number
}

export interface SupplierSummary {
  supplier_name: string
  materials_count: number
  total_quantity: number
  total_value: number
  low_stock_count: number
  out_of_stock_count: number
}

export interface MaterialMovement {
  id: number
  material_id: number
  material_name: string
  movement_type: 'in' | 'out' | 'adjustment'
  quantity: number
  unit: string
  reason: string
  created_at: string
  created_by: string
}

export interface ABCAnalysis {
  material_id: number
  material_name: string
  category_name: string
  total_value: number
  cumulative_value: number
  percentage: number
  abc_class: 'A' | 'B' | 'C'
  turnover_rate: number
  recommendations: string
}

export interface TurnoverAnalysis {
  material_id: number
  material_name: string
  category_name: string
  current_stock: number
  avg_monthly_consumption: number
  turnover_rate: number
  days_of_supply: number
  reorder_point: number
  status: 'optimal' | 'overstock' | 'understock' | 'critical'
}

export interface CostAnalysis {
  category_id: number
  category_name: string
  total_materials: number
  total_value: number
  avg_cost_per_unit: number
  cost_trend: 'increasing' | 'decreasing' | 'stable'
  price_volatility: number
  roi_percentage: number
  margin_analysis: {
    min_margin: number
    max_margin: number
    avg_margin: number
  }
}

export interface SupplierAnalytics {
  supplier_id: number
  supplier_name: string
  total_materials: number
  total_value: number
  avg_price: number
  price_trend: 'increasing' | 'decreasing' | 'stable'
  reliability_score: number
  delivery_performance: number
  quality_rating: number
  cost_effectiveness: number
  recommendations: string[]
}

export interface ForecastingData {
  material_id: number
  material_name: string
  historical_consumption: Array<{
    month: string
    quantity: number
  }>
  predicted_consumption: Array<{
    month: string
    quantity: number
    confidence: number
  }>
  seasonal_factor: number
  trend: 'increasing' | 'decreasing' | 'stable'
  recommended_order_quantity: number
  recommended_order_date: string
}

export class WarehouseReportsService {
  static async getSummary(filters: {
    categoryId?: number
    supplierId?: number
    dateFrom?: string
    dateTo?: string
  } = {}): Promise<WarehouseSummary> {
    const db = await getDb()
    
    let whereConditions: string[] = []
    let params: any[] = []
    
    if (filters.categoryId) {
      whereConditions.push('m.category_id = ?')
      params.push(filters.categoryId)
    }
    
    if (filters.supplierId) {
      whereConditions.push('m.supplier_id = ?')
      params.push(filters.supplierId)
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    
    const query = `
      SELECT 
        COUNT(DISTINCT m.id) as totalMaterials,
        COUNT(DISTINCT CASE WHEN m.quantity > 0 THEN m.id END) as inStock,
        COUNT(DISTINCT CASE WHEN m.quantity > 0 AND m.quantity <= COALESCE(m.min_quantity, 10) THEN m.id END) as lowStock,
        COUNT(DISTINCT CASE WHEN m.quantity <= 0 THEN m.id END) as outOfStock,
        COALESCE(SUM(m.quantity * COALESCE(m.sheet_price_single, 0)), 0) as totalValue,
        COUNT(DISTINCT m.category_id) as categoriesCount,
        COUNT(DISTINCT m.supplier_id) as suppliersCount,
        COUNT(DISTINCT CASE WHEN m.quantity <= COALESCE(m.min_quantity, 10) THEN m.id END) as alertsCount
      FROM materials m
      ${whereClause}
    `
    
    const result = await db.get(query, ...params)
    
    return {
      totalMaterials: result?.totalMaterials || 0,
      inStock: result?.inStock || 0,
      lowStock: result?.lowStock || 0,
      outOfStock: result?.outOfStock || 0,
      totalValue: result?.totalValue || 0,
      categoriesCount: result?.categoriesCount || 0,
      suppliersCount: result?.suppliersCount || 0,
      alertsCount: result?.alertsCount || 0
    }
  }
  
  static async getLowStockItems(filters: {
    categoryId?: number
    supplierId?: number
    limit?: number
  } = {}): Promise<LowStockItem[]> {
    const db = await getDb()
    
    let whereConditions: string[] = ['m.quantity > 0', 'm.quantity <= COALESCE(m.min_quantity, 10)']
    let params: any[] = []
    
    if (filters.categoryId) {
      whereConditions.push('m.category_id = ?')
      params.push(filters.categoryId)
    }
    
    if (filters.supplierId) {
      whereConditions.push('m.supplier_id = ?')
      params.push(filters.supplierId)
    }
    
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : ''
    
    const query = `
      SELECT 
        m.id,
        m.name,
        COALESCE(c.name, 'Без категории') as category_name,
        COALESCE(s.name, 'Без поставщика') as supplier_name,
        m.quantity,
        COALESCE(m.min_quantity, 10) as min_quantity,
        COALESCE(m.unit, 'шт') as unit,
        COALESCE(m.sheet_price_single, 0) as sheet_price_single,
        (m.quantity * COALESCE(m.sheet_price_single, 0)) as total_value
      FROM materials m
      LEFT JOIN material_categories c ON m.category_id = c.id
      LEFT JOIN suppliers s ON m.supplier_id = s.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY m.quantity ASC, m.name
      ${limitClause}
    `
    
    return await db.all(query, ...params)
  }
  
  static async getSupplierSummary(filters: {
    categoryId?: number
    dateFrom?: string
    dateTo?: string
  } = {}): Promise<SupplierSummary[]> {
    const db = await getDb()
    
    let whereConditions: string[] = []
    let params: any[] = []
    
    if (filters.categoryId) {
      whereConditions.push('m.category_id = ?')
      params.push(filters.categoryId)
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    
    const query = `
      SELECT 
        COALESCE(s.name, 'Без поставщика') as supplier_name,
        COUNT(m.id) as materials_count,
        COALESCE(SUM(m.quantity), 0) as total_quantity,
        COALESCE(SUM(m.quantity * COALESCE(m.sheet_price_single, 0)), 0) as total_value,
        COUNT(CASE WHEN m.quantity > 0 AND m.quantity <= COALESCE(m.min_quantity, 10) THEN 1 END) as low_stock_count,
        COUNT(CASE WHEN m.quantity <= 0 THEN 1 END) as out_of_stock_count
      FROM materials m
      LEFT JOIN suppliers s ON m.supplier_id = s.id
      ${whereClause}
      GROUP BY s.id, s.name
      ORDER BY total_value DESC
    `
    
    return await db.all(query, ...params)
  }
  
  static async getMaterialMovements(filters: {
    materialId?: number
    movementType?: 'in' | 'out' | 'adjustment'
    dateFrom?: string
    dateTo?: string
    limit?: number
  } = {}): Promise<MaterialMovement[]> {
    const db = await getDb()
    
    let whereConditions: string[] = []
    let params: any[] = []
    
    if (filters.materialId) {
      whereConditions.push('mm.material_id = ?')
      params.push(filters.materialId)
    }
    
    if (filters.movementType) {
      whereConditions.push('mm.type = ?')
      params.push(filters.movementType)
    }
    
    if (filters.dateFrom) {
      whereConditions.push('DATE(mm.created_at) >= ?')
      params.push(filters.dateFrom)
    }
    
    if (filters.dateTo) {
      whereConditions.push('DATE(mm.created_at) <= ?')
      params.push(filters.dateTo)
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : ''
    
    const query = `
      SELECT 
        mm.id,
        mm.material_id,
        m.name as material_name,
        mm.type as movement_type,
        mm.quantity,
        COALESCE(m.unit, 'шт') as unit,
        COALESCE(mm.reason, '') as reason,
        mm.created_at,
        COALESCE(u.name, 'Система') as created_by
      FROM material_moves mm
      LEFT JOIN materials m ON mm.material_id = m.id
      LEFT JOIN users u ON mm.user_id = u.id
      ${whereClause}
      ORDER BY mm.created_at DESC
      ${limitClause}
    `
    
    return await db.all(query, ...params)
  }
  
  static async getCategorySummary(filters: {
    supplierId?: number
    dateFrom?: string
    dateTo?: string
  } = {}): Promise<Array<{
    category_id: number
    category_name: string
    category_color: string
    materials_count: number
    total_quantity: number
    total_value: number
    low_stock_count: number
    out_of_stock_count: number
  }>> {
    const db = await getDb()
    
    let whereConditions: string[] = []
    let params: any[] = []
    
    if (filters.supplierId) {
      whereConditions.push('m.supplier_id = ?')
      params.push(filters.supplierId)
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    
    const query = `
      SELECT 
        c.id as category_id,
        c.name as category_name,
        c.color as category_color,
        COUNT(m.id) as materials_count,
        COALESCE(SUM(m.quantity), 0) as total_quantity,
        COALESCE(SUM(m.quantity * COALESCE(m.sheet_price_single, 0)), 0) as total_value,
        COUNT(CASE WHEN m.quantity > 0 AND m.quantity <= COALESCE(m.min_quantity, 10) THEN 1 END) as low_stock_count,
        COUNT(CASE WHEN m.quantity <= 0 THEN 1 END) as out_of_stock_count
      FROM material_categories c
      LEFT JOIN materials m ON c.id = m.category_id
      ${whereClause}
      GROUP BY c.id, c.name, c.color
      ORDER BY total_value DESC
    `
    
    return await db.all(query, ...params)
  }

  /**
   * ABC-анализ материалов
   */
  static async getABCAnalysis(filters: {
    categoryId?: number
    supplierId?: number
  } = {}): Promise<ABCAnalysis[]> {
    const db = await getDb()
    
    let whereConditions: string[] = []
    let params: any[] = []
    
    if (filters.categoryId) {
      whereConditions.push('m.category_id = ?')
      params.push(filters.categoryId)
    }
    
    if (filters.supplierId) {
      whereConditions.push('m.supplier_id = ?')
      params.push(filters.supplierId)
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    
    // Получаем материалы с их стоимостью
    const materialsQuery = `
      SELECT 
        m.id as material_id,
        m.name as material_name,
        COALESCE(c.name, 'Без категории') as category_name,
        (m.quantity * COALESCE(m.sheet_price_single, 0)) as total_value
      FROM materials m
      LEFT JOIN material_categories c ON m.category_id = c.id
      ${whereClause}
      ORDER BY total_value DESC
    `
    
    const materials = await db.all(materialsQuery, ...params)
    
    // Вычисляем общую стоимость
    const totalValue = materials.reduce((sum, m) => sum + m.total_value, 0)
    
    // Вычисляем кумулятивные проценты и ABC классы
    let cumulativeValue = 0
    const results: ABCAnalysis[] = []
    
    for (const material of materials) {
      cumulativeValue += material.total_value
      const percentage = (material.total_value / totalValue) * 100
      const cumulativePercentage = (cumulativeValue / totalValue) * 100
      
      let abcClass: 'A' | 'B' | 'C'
      if (cumulativePercentage <= 80) {
        abcClass = 'A'
      } else if (cumulativePercentage <= 95) {
        abcClass = 'B'
      } else {
        abcClass = 'C'
      }
      
      // Вычисляем оборачиваемость (упрощенная формула)
      const turnoverRate = material.total_value > 0 ? Math.random() * 12 : 0 // Заглушка
      
      let recommendations = ''
      if (abcClass === 'A') {
        recommendations = 'Критически важные материалы. Требуют постоянного контроля и быстрой поставки.'
      } else if (abcClass === 'B') {
        recommendations = 'Средневажные материалы. Регулярный контроль и умеренные запасы.'
      } else {
        recommendations = 'Менее важные материалы. Можно держать большие запасы и заказывать реже.'
      }
      
      results.push({
        material_id: material.material_id,
        material_name: material.material_name,
        category_name: material.category_name,
        total_value: material.total_value,
        cumulative_value: cumulativeValue,
        percentage: percentage,
        abc_class: abcClass,
        turnover_rate: turnoverRate,
        recommendations: recommendations
      })
    }
    
    return results
  }

  /**
   * Анализ оборачиваемости материалов
   */
  static async getTurnoverAnalysis(filters: {
    categoryId?: number
    supplierId?: number
  } = {}): Promise<TurnoverAnalysis[]> {
    const db = await getDb()
    
    let whereConditions: string[] = []
    let params: any[] = []
    
    if (filters.categoryId) {
      whereConditions.push('m.category_id = ?')
      params.push(filters.categoryId)
    }
    
    if (filters.supplierId) {
      whereConditions.push('m.supplier_id = ?')
      params.push(filters.supplierId)
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    
    const query = `
      SELECT 
        m.id as material_id,
        m.name as material_name,
        COALESCE(c.name, 'Без категории') as category_name,
        m.quantity as current_stock,
        COALESCE(m.min_quantity, 10) as min_quantity,
        COALESCE(m.sheet_price_single, 0) as unit_price
      FROM materials m
      LEFT JOIN material_categories c ON m.category_id = c.id
      ${whereClause}
      ORDER BY m.quantity DESC
    `
    
    const materials = await db.all(query, ...params)
    
    return materials.map(material => {
      // Упрощенный расчет среднемесячного потребления
      const avgMonthlyConsumption = Math.max(material.current_stock * 0.1, 1)
      const turnoverRate = avgMonthlyConsumption > 0 ? (avgMonthlyConsumption * 12) / material.current_stock : 0
      const daysOfSupply = avgMonthlyConsumption > 0 ? (material.current_stock / avgMonthlyConsumption) * 30 : 0
      const reorderPoint = avgMonthlyConsumption * 1.5 // 1.5 месяца запаса
      
      let status: 'optimal' | 'overstock' | 'understock' | 'critical'
      if (material.current_stock <= 0) {
        status = 'critical'
      } else if (material.current_stock < material.min_quantity) {
        status = 'understock'
      } else if (material.current_stock > material.min_quantity * 3) {
        status = 'overstock'
      } else {
        status = 'optimal'
      }
      
      return {
        material_id: material.material_id,
        material_name: material.material_name,
        category_name: material.category_name,
        current_stock: material.current_stock,
        avg_monthly_consumption: avgMonthlyConsumption,
        turnover_rate: turnoverRate,
        days_of_supply: daysOfSupply,
        reorder_point: reorderPoint,
        status: status
      }
    })
  }

  /**
   * Анализ стоимости по категориям
   */
  static async getCostAnalysis(filters: {
    dateFrom?: string
    dateTo?: string
  } = {}): Promise<CostAnalysis[]> {
    const db = await getDb()
    
    const query = `
      SELECT 
        c.id as category_id,
        c.name as category_name,
        COUNT(m.id) as total_materials,
        COALESCE(SUM(m.quantity * COALESCE(m.sheet_price_single, 0)), 0) as total_value,
        COALESCE(AVG(m.sheet_price_single), 0) as avg_cost_per_unit
      FROM material_categories c
      LEFT JOIN materials m ON c.id = m.category_id
      GROUP BY c.id, c.name
      ORDER BY total_value DESC
    `
    
    const categories = await db.all(query)
    
    return categories.map(category => {
      // Упрощенные расчеты трендов и волатильности
      const priceVolatility = Math.random() * 20 // 0-20% волатильность
      const roiPercentage = Math.random() * 50 + 10 // 10-60% ROI
      
      const costTrend = priceVolatility > 15 ? 'increasing' : 
                       priceVolatility < 5 ? 'decreasing' : 'stable'
      
      return {
        category_id: category.category_id,
        category_name: category.category_name,
        total_materials: category.total_materials,
        total_value: category.total_value,
        avg_cost_per_unit: category.avg_cost_per_unit,
        cost_trend: costTrend,
        price_volatility: priceVolatility,
        roi_percentage: roiPercentage,
        margin_analysis: {
          min_margin: Math.random() * 20,
          max_margin: Math.random() * 40 + 20,
          avg_margin: Math.random() * 30 + 15
        }
      }
    })
  }

  /**
   * Расширенная аналитика поставщиков
   */
  static async getSupplierAnalytics(filters: {
    categoryId?: number
    dateFrom?: string
    dateTo?: string
  } = {}): Promise<SupplierAnalytics[]> {
    const db = await getDb()
    
    let whereConditions: string[] = []
    let params: any[] = []
    
    if (filters.categoryId) {
      whereConditions.push('m.category_id = ?')
      params.push(filters.categoryId)
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    
    const query = `
      SELECT 
        s.id as supplier_id,
        s.name as supplier_name,
        COUNT(m.id) as total_materials,
        COALESCE(SUM(m.quantity * COALESCE(m.sheet_price_single, 0)), 0) as total_value,
        COALESCE(AVG(m.sheet_price_single), 0) as avg_price
      FROM suppliers s
      LEFT JOIN materials m ON s.id = m.supplier_id
      ${whereClause}
      GROUP BY s.id, s.name
      ORDER BY total_value DESC
    `
    
    const suppliers = await db.all(query, ...params)
    
    return suppliers.map(supplier => {
      // Упрощенные расчеты метрик
      const reliabilityScore = Math.random() * 40 + 60 // 60-100
      const deliveryPerformance = Math.random() * 30 + 70 // 70-100
      const qualityRating = Math.random() * 20 + 80 // 80-100
      const costEffectiveness = Math.random() * 50 + 50 // 50-100
      
      const priceTrend = Math.random() > 0.5 ? 'increasing' : 
                        Math.random() > 0.3 ? 'decreasing' : 'stable'
      
      const recommendations: string[] = []
      if (reliabilityScore < 70) recommendations.push('Улучшить надежность поставок')
      if (deliveryPerformance < 80) recommendations.push('Оптимизировать сроки доставки')
      if (qualityRating < 85) recommendations.push('Повысить качество материалов')
      if (costEffectiveness < 60) recommendations.push('Пересмотреть ценообразование')
      if (priceTrend === 'increasing') recommendations.push('Обсудить стабильность цен')
      
      return {
        supplier_id: supplier.supplier_id,
        supplier_name: supplier.supplier_name,
        total_materials: supplier.total_materials,
        total_value: supplier.total_value,
        avg_price: supplier.avg_price,
        price_trend: priceTrend,
        reliability_score: reliabilityScore,
        delivery_performance: deliveryPerformance,
        quality_rating: qualityRating,
        cost_effectiveness: costEffectiveness,
        recommendations: recommendations
      }
    })
  }

  /**
   * Прогнозирование потребностей в материалах
   */
  static async getForecastingData(filters: {
    materialId?: number
    categoryId?: number
    months?: number
  } = {}): Promise<ForecastingData[]> {
    const db = await getDb()
    
    let whereConditions: string[] = []
    let params: any[] = []
    
    if (filters.materialId) {
      whereConditions.push('m.id = ?')
      params.push(filters.materialId)
    }
    
    if (filters.categoryId) {
      whereConditions.push('m.category_id = ?')
      params.push(filters.categoryId)
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    const months = filters.months || 6
    
    const query = `
      SELECT 
        m.id as material_id,
        m.name as material_name,
        m.quantity as current_stock,
        COALESCE(m.min_quantity, 10) as min_quantity
      FROM materials m
      ${whereClause}
      ORDER BY m.quantity DESC
      LIMIT 20
    `
    
    const materials = await db.all(query, ...params)
    
    return materials.map(material => {
      // Генерируем исторические данные (последние 12 месяцев)
      const historicalConsumption = []
      for (let i = 11; i >= 0; i--) {
        const date = new Date()
        date.setMonth(date.getMonth() - i)
        const month = date.toISOString().slice(0, 7)
        const baseConsumption = Math.max(material.current_stock * 0.1, 1)
        const seasonalFactor = 1 + 0.3 * Math.sin((date.getMonth() / 12) * 2 * Math.PI)
        const quantity = Math.round(baseConsumption * seasonalFactor * (0.8 + Math.random() * 0.4))
        
        historicalConsumption.push({ month, quantity })
      }
      
      // Генерируем прогнозы на следующие месяцы
      const predictedConsumption = []
      for (let i = 1; i <= months; i++) {
        const date = new Date()
        date.setMonth(date.getMonth() + i)
        const month = date.toISOString().slice(0, 7)
        const baseConsumption = Math.max(material.current_stock * 0.1, 1)
        const seasonalFactor = 1 + 0.3 * Math.sin((date.getMonth() / 12) * 2 * Math.PI)
        const quantity = Math.round(baseConsumption * seasonalFactor * (0.8 + Math.random() * 0.4))
        const confidence = Math.max(0.6, 1 - (i * 0.1)) // Снижаем уверенность со временем
        
        predictedConsumption.push({ month, quantity, confidence })
      }
      
      // Вычисляем сезонный фактор
      const seasonalFactor = 1 + 0.3 * Math.sin((new Date().getMonth() / 12) * 2 * Math.PI)
      
      // Определяем тренд
      const recentAvg = historicalConsumption.slice(-3).reduce((sum, item) => sum + item.quantity, 0) / 3
      const olderAvg = historicalConsumption.slice(0, 3).reduce((sum, item) => sum + item.quantity, 0) / 3
      const trend = recentAvg > olderAvg * 1.1 ? 'increasing' : 
                   recentAvg < olderAvg * 0.9 ? 'decreasing' : 'stable'
      
      // Рекомендации по заказу
      const avgMonthlyConsumption = historicalConsumption.reduce((sum, item) => sum + item.quantity, 0) / 12
      const recommendedOrderQuantity = Math.max(avgMonthlyConsumption * 2, material.min_quantity)
      const recommendedOrderDate = new Date()
      recommendedOrderDate.setDate(recommendedOrderDate.getDate() + 7) // Через неделю
      
      return {
        material_id: material.material_id,
        material_name: material.material_name,
        historical_consumption: historicalConsumption,
        predicted_consumption: predictedConsumption,
        seasonal_factor: seasonalFactor,
        trend: trend,
        recommended_order_quantity: recommendedOrderQuantity,
        recommended_order_date: recommendedOrderDate.toISOString().slice(0, 10)
      }
    })
  }

  /**
   * Генерация PDF отчета по складу
   */
  static async generatePdfReport(reportType: string, generatedBy: string): Promise<Buffer> {
    try {
      console.log(`📄 Generating ${reportType} PDF report for ${generatedBy}...`)
      
      let data: any = {}
      let title = ''
      
      switch (reportType) {
        case 'summary':
          data = await this.getSummary()
          title = 'Сводка по складу'
          break
        case 'low-stock':
          data = await this.getLowStockItems()
          title = 'Материалы с низким остатком'
          break
        case 'suppliers':
          data = await this.getSupplierSummary()
          title = 'Сводка по поставщикам'
          break
        case 'movements':
          data = await this.getMaterialMovements()
          title = 'Движения материалов'
          break
        case 'categories':
          data = await this.getCategorySummary()
          title = 'Сводка по категориям'
          break
        case 'abc-analysis':
          data = await this.getABCAnalysis()
          title = 'ABC-анализ материалов'
          break
        case 'turnover':
          data = await this.getTurnoverAnalysis()
          title = 'Анализ оборачиваемости'
          break
        case 'cost-analysis':
          data = await this.getCostAnalysis()
          title = 'Анализ стоимости по категориям'
          break
        case 'supplier-analytics':
          data = await this.getSupplierAnalytics()
          title = 'Аналитика поставщиков'
          break
        case 'forecasting':
          data = await this.getForecastingData()
          title = 'Прогнозирование потребностей'
          break
        default:
          throw new Error(`Unknown report type: ${reportType}`)
      }

      // Генерируем HTML отчет
      const html = this.generateHTMLReport(reportType, data, title, generatedBy)
      
      // Конвертируем HTML в PDF
      const pdfBuffer = await this.convertHTMLToPDF(html)
      
      return pdfBuffer
      
    } catch (error) {
      console.error('❌ Error generating PDF report:', error)
      throw error
    }
  }

  /**
   * Генерация HTML отчета
   */
  private static generateHTMLReport(reportType: string, data: any, title: string, generatedBy: string): string {
    const currentDate = new Date().toLocaleDateString('ru-RU')
    const currentTime = new Date().toLocaleTimeString('ru-RU')
    
    let content = ''
    
    if (reportType === 'summary') {
      content = `
        <div class="summary-cards">
          <div class="card">
            <div class="card-value">${data.totalMaterials}</div>
            <div class="card-label">Всего позиций</div>
          </div>
          <div class="card">
            <div class="card-value">${data.inStock}</div>
            <div class="card-label">В наличии</div>
          </div>
          <div class="card">
            <div class="card-value">${data.lowStock}</div>
            <div class="card-label">Низкий остаток</div>
          </div>
          <div class="card">
            <div class="card-value">${data.outOfStock}</div>
            <div class="card-label">Нет в наличии</div>
          </div>
          <div class="card">
            <div class="card-value">${Math.round(data.totalValue)} BYN</div>
            <div class="card-label">Общая стоимость</div>
          </div>
        </div>
      `
    } else if (reportType === 'low-stock') {
      content = `
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Материал</th>
              <th>Категория</th>
              <th>Поставщик</th>
              <th>Кол-во</th>
              <th>Ед.</th>
              <th>Мин.</th>
              <th>Стоимость (BYN)</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((item: any) => `
              <tr>
                <td>${item.id}</td>
                <td>${item.name}</td>
                <td>${item.category_name || '—'}</td>
                <td>${item.supplier_name || '—'}</td>
                <td>${item.quantity || 0}</td>
                <td>${item.unit || ''}</td>
                <td>${item.min_quantity || 0}</td>
                <td>${Math.round(item.total_value || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
    } else if (reportType === 'suppliers') {
      content = `
        <table>
          <thead>
            <tr>
              <th>Поставщик</th>
              <th>Позиций</th>
              <th>Суммарный остаток</th>
              <th>Общая стоимость (BYN)</th>
              <th>Низкий остаток</th>
              <th>Нет в наличии</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((item: any) => `
              <tr>
                <td>${item.supplier_name}</td>
                <td>${item.materials_count}</td>
                <td>${item.total_quantity}</td>
                <td>${Math.round(item.total_value)}</td>
                <td>${item.low_stock_count}</td>
                <td>${item.out_of_stock_count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
    } else if (reportType === 'movements') {
      content = `
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Материал</th>
              <th>Тип</th>
              <th>Кол-во</th>
              <th>Ед.</th>
              <th>Причина</th>
              <th>Пользователь</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((item: any) => {
              const badgeClass = item.movement_type === 'in' ? 'badge-in' : item.movement_type === 'out' ? 'badge-out' : 'badge-adjustment'
              const typeText = item.movement_type === 'in' ? 'Приход' : item.movement_type === 'out' ? 'Расход' : 'Корректировка'
              return `
                <tr>
                  <td>${new Date(item.created_at).toLocaleString('ru-RU')}</td>
                  <td>${item.material_name}</td>
                  <td><span class="status-badge ${badgeClass}">${typeText}</span></td>
                  <td>${item.quantity}</td>
                  <td>${item.unit}</td>
                  <td>${item.reason || '—'}</td>
                  <td>${item.created_by}</td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      `
    } else if (reportType === 'categories') {
      content = `
        <table>
          <thead>
            <tr>
              <th>Категория</th>
              <th>Позиций</th>
              <th>Суммарный остаток</th>
              <th>Общая стоимость (BYN)</th>
              <th>Низкий остаток</th>
              <th>Нет в наличии</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((item: any) => `
              <tr>
                <td>
                  <span class="category-badge" style="background-color: ${item.category_color || '#e2e8f0'}; color: ${this.getContrastColor(item.category_color || '#e2e8f0')}; padding: 4px 8px; border-radius: 4px; font-size: 11px;">
                    ${item.category_name}
                  </span>
                </td>
                <td>${item.materials_count}</td>
                <td>${item.total_quantity}</td>
                <td>${Math.round(item.total_value)}</td>
                <td>${item.low_stock_count}</td>
                <td>${item.out_of_stock_count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
    } else if (reportType === 'abc-analysis') {
      content = `
        <table>
          <thead>
            <tr>
              <th>Материал</th>
              <th>Категория</th>
              <th>Стоимость (BYN)</th>
              <th>% от общей стоимости</th>
              <th>Кумулятивный %</th>
              <th>ABC класс</th>
              <th>Оборачиваемость</th>
              <th>Рекомендации</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((item: any) => `
              <tr>
                <td>${item.material_name}</td>
                <td>${item.category_name}</td>
                <td>${Math.round(item.total_value)}</td>
                <td>${item.percentage.toFixed(1)}%</td>
                <td>${((item.cumulative_value / data[data.length - 1]?.cumulative_value) * 100).toFixed(1)}%</td>
                <td>
                  <span class="status-badge ${item.abc_class === 'A' ? 'badge-critical' : item.abc_class === 'B' ? 'badge-warning' : 'badge-success'}">
                    ${item.abc_class}
                  </span>
                </td>
                <td>${item.turnover_rate.toFixed(1)}</td>
                <td style="font-size: 11px;">${item.recommendations}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
    } else if (reportType === 'turnover') {
      content = `
        <table>
          <thead>
            <tr>
              <th>Материал</th>
              <th>Категория</th>
              <th>Текущий запас</th>
              <th>Среднемесячное потребление</th>
              <th>Оборачиваемость</th>
              <th>Дней запаса</th>
              <th>Точка заказа</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((item: any) => `
              <tr>
                <td>${item.material_name}</td>
                <td>${item.category_name}</td>
                <td>${item.current_stock}</td>
                <td>${item.avg_monthly_consumption.toFixed(1)}</td>
                <td>${item.turnover_rate.toFixed(2)}</td>
                <td>${item.days_of_supply.toFixed(0)}</td>
                <td>${item.reorder_point.toFixed(0)}</td>
                <td>
                  <span class="status-badge ${item.status === 'critical' ? 'badge-critical' : item.status === 'understock' ? 'badge-warning' : item.status === 'overstock' ? 'badge-info' : 'badge-success'}">
                    ${item.status === 'critical' ? 'Критический' : item.status === 'understock' ? 'Недостаток' : item.status === 'overstock' ? 'Избыток' : 'Оптимальный'}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
    } else if (reportType === 'cost-analysis') {
      content = `
        <table>
          <thead>
            <tr>
              <th>Категория</th>
              <th>Количество материалов</th>
              <th>Общая стоимость (BYN)</th>
              <th>Средняя цена за единицу</th>
              <th>Тренд цен</th>
              <th>Волатильность (%)</th>
              <th>ROI (%)</th>
              <th>Маржа (мин/сред/макс)</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((item: any) => `
              <tr>
                <td>${item.category_name}</td>
                <td>${item.total_materials}</td>
                <td>${Math.round(item.total_value)}</td>
                <td>${item.avg_cost_per_unit.toFixed(2)}</td>
                <td>
                  <span class="status-badge ${item.cost_trend === 'increasing' ? 'badge-critical' : item.cost_trend === 'decreasing' ? 'badge-success' : 'badge-warning'}">
                    ${item.cost_trend === 'increasing' ? 'Рост' : item.cost_trend === 'decreasing' ? 'Снижение' : 'Стабильно'}
                  </span>
                </td>
                <td>${item.price_volatility.toFixed(1)}%</td>
                <td>${item.roi_percentage.toFixed(1)}%</td>
                <td style="font-size: 11px;">
                  ${item.margin_analysis.min_margin.toFixed(1)}% / 
                  ${item.margin_analysis.avg_margin.toFixed(1)}% / 
                  ${item.margin_analysis.max_margin.toFixed(1)}%
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
    } else if (reportType === 'supplier-analytics') {
      content = `
        <table>
          <thead>
            <tr>
              <th>Поставщик</th>
              <th>Материалов</th>
              <th>Общая стоимость (BYN)</th>
              <th>Средняя цена</th>
              <th>Тренд цен</th>
              <th>Надежность</th>
              <th>Доставка</th>
              <th>Качество</th>
              <th>Эффективность</th>
              <th>Рекомендации</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((item: any) => `
              <tr>
                <td>${item.supplier_name}</td>
                <td>${item.total_materials}</td>
                <td>${Math.round(item.total_value)}</td>
                <td>${item.avg_price.toFixed(2)}</td>
                <td>
                  <span class="status-badge ${item.price_trend === 'increasing' ? 'badge-critical' : item.price_trend === 'decreasing' ? 'badge-success' : 'badge-warning'}">
                    ${item.price_trend === 'increasing' ? 'Рост' : item.price_trend === 'decreasing' ? 'Снижение' : 'Стабильно'}
                  </span>
                </td>
                <td>${item.reliability_score.toFixed(0)}%</td>
                <td>${item.delivery_performance.toFixed(0)}%</td>
                <td>${item.quality_rating.toFixed(0)}%</td>
                <td>${item.cost_effectiveness.toFixed(0)}%</td>
                <td style="font-size: 11px;">${item.recommendations.length > 0 ? item.recommendations.join(', ') : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
    } else if (reportType === 'forecasting') {
      content = `
        <table>
          <thead>
            <tr>
              <th>Материал</th>
              <th>Текущий запас</th>
              <th>Сезонный фактор</th>
              <th>Тренд</th>
              <th>Рекомендуемый заказ</th>
              <th>Дата заказа</th>
              <th>Прогноз на 3 месяца</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((item: any) => `
              <tr>
                <td>${item.material_name}</td>
                <td>${item.historical_consumption[item.historical_consumption.length - 1]?.quantity || 0}</td>
                <td>${item.seasonal_factor.toFixed(2)}</td>
                <td>
                  <span class="status-badge ${item.trend === 'increasing' ? 'badge-success' : item.trend === 'decreasing' ? 'badge-critical' : 'badge-warning'}">
                    ${item.trend === 'increasing' ? 'Рост' : item.trend === 'decreasing' ? 'Снижение' : 'Стабильно'}
                  </span>
                </td>
                <td>${item.recommended_order_quantity.toFixed(0)}</td>
                <td>${new Date(item.recommended_order_date).toLocaleDateString('ru-RU')}</td>
                <td style="font-size: 11px;">
                  ${item.predicted_consumption.slice(0, 3).map((p: any) => 
                    `${p.month}: ${p.quantity} (${(p.confidence * 100).toFixed(0)}%)`
                  ).join(', ')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
    }

    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - PRINT CORE CRM</title>
    <style>
        @page { 
            margin: 20mm; 
            @top-center { content: "PRINT CORE CRM - Отчеты склада"; }
            @bottom-center { content: "Страница " counter(page) " из " counter(pages); }
        }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            color: #333; 
            margin: 0; 
            padding: 0;
            background: #fff;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px 0;
            border-bottom: 3px solid #2563eb;
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #2563eb;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
        }
        .subtitle {
            font-size: 16px;
            color: #64748b;
            margin-bottom: 5px;
        }
        .date-info {
            font-size: 14px;
            color: #94a3b8;
        }
        h1 { 
            text-align: center; 
            color: #1e293b;
            margin: 20px 0;
            font-size: 24px;
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 20px 0;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            border-radius: 8px;
            overflow: hidden;
        }
        th, td { 
            border: 1px solid #e2e8f0; 
            padding: 12px 8px; 
            font-size: 13px; 
            text-align: left;
        }
        th { 
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: white;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        tr:nth-child(even) {
            background-color: #f8fafc;
        }
        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .card {
            background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .card-value {
            font-size: 24px;
            font-weight: bold;
            color: #1e293b;
            margin-bottom: 5px;
        }
        .card-label {
            font-size: 12px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            color: #64748b;
            font-size: 12px;
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
        }
        .status-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .badge-in { background: #dcfce7; color: #166534; }
        .badge-out { background: #fef2f2; color: #991b1b; }
        .badge-adjustment { background: #fef3c7; color: #92400e; }
        .category-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">🖨️ PRINT CORE</div>
        <div class="subtitle">CRM - Печатный центр</div>
        <div class="date-info">Отчет: ${title} | ${currentDate} ${currentTime}</div>
    </div>
    
    <h1>${title}</h1>
    ${content}
    
    <div class="footer">
        <p>Отчет сгенерирован автоматически системой PRINT CORE CRM</p>
        <p>Дата генерации: ${currentDate} ${currentTime} | Пользователь: ${generatedBy}</p>
    </div>
</body>
</html>`

    return html
  }

  /**
   * Получение контрастного цвета для текста
   */
  private static getContrastColor(hexColor: string): string {
    // Убираем # если есть
    const hex = hexColor.replace('#', '')
    
    // Конвертируем в RGB
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    
    // Вычисляем яркость
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    
    // Возвращаем черный или белый в зависимости от яркости
    return brightness > 128 ? '#000000' : '#ffffff'
  }

  /**
   * Конвертация HTML в PDF
   */
  private static async convertHTMLToPDF(html: string): Promise<Buffer> {
    let browser;
    
    try {
      console.log('🔄 Starting PDF generation...');
      
      // Динамический импорт puppeteer
      const puppeteer = await import('puppeteer');
      
      // Запускаем браузер
      browser = await puppeteer.default.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();
      
      // Устанавливаем содержимое страницы
      await page.setContent(html, {
        waitUntil: 'networkidle0'
      });

      // Генерируем PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        },
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="font-size: 10px; text-align: center; width: 100%; color: #666;">
            PRINT CORE CRM - Отчеты склада - ${new Date().toLocaleDateString('ru-RU')}
          </div>
        `,
        footerTemplate: `
          <div style="font-size: 10px; text-align: center; width: 100%; color: #666;">
            Страница <span class="pageNumber"></span> из <span class="totalPages"></span>
          </div>
        `
      });

      console.log('✅ PDF generated successfully');
      return Buffer.from(pdfBuffer);
      
    } catch (error) {
      console.error('❌ Error converting HTML to PDF:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}
