import { Request, Response } from 'express'
import { MaterialsAnalyticsService } from '../services/materialsAnalyticsService'
import { logger } from '../utils/logger'
import { AuthenticatedRequest } from '../middleware'

export class MaterialsAnalyticsController {
  /**
   * Получить полную аналитику по материалам
   */
  static getFullAnalytics = async (req: Request, res: Response) => {
    try {
      const analytics = await MaterialsAnalyticsService.getFullAnalytics()
      
      res.json({
        success: true,
        data: analytics
      })
    } catch (error: any) {
      logger.error('Ошибка получения аналитики материалов', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка получения аналитики материалов',
        details: error.message
      })
    }
  }

  /**
   * Получить аналитику по конкретному материалу
   */
  static getMaterialAnalytics = async (req: Request, res: Response) => {
    try {
      const materialId = Number(req.params.materialId)
      
      if (!materialId || isNaN(materialId)) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать корректный ID материала'
        })
        return
      }

      const analytics = await MaterialsAnalyticsService.getMaterialAnalytics(materialId)
      
      if (!analytics) {
        res.status(404).json({
          success: false,
          error: 'Материал не найден'
        })
        return
      }

      res.json({
        success: true,
        data: analytics
      })
    } catch (error: any) {
      logger.error('Ошибка получения аналитики материала', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка получения аналитики материала',
        details: error.message
      })
    }
  }

  /**
   * Получить сводную аналитику
   */
  static getSummaryAnalytics = async (req: Request, res: Response) => {
    try {
      const analytics = await MaterialsAnalyticsService.getFullAnalytics()
      
      // Возвращаем только сводку
      res.json({
        success: true,
        data: {
          summary: analytics.summary,
          trends: analytics.trends,
          recommendations: analytics.recommendations
        }
      })
    } catch (error: any) {
      logger.error('Ошибка получения сводной аналитики', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка получения сводной аналитики',
        details: error.message
      })
    }
  }

  /**
   * Получить аналитику потребления
   */
  static getConsumptionAnalytics = async (req: Request, res: Response) => {
    try {
      const analytics = await MaterialsAnalyticsService.getFullAnalytics()
      
      res.json({
        success: true,
        data: analytics.consumption
      })
    } catch (error: any) {
      logger.error('Ошибка получения аналитики потребления', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка получения аналитики потребления',
        details: error.message
      })
    }
  }

  /**
   * Получить аналитику поставщиков
   */
  static getSupplierAnalytics = async (req: Request, res: Response) => {
    try {
      const analytics = await MaterialsAnalyticsService.getFullAnalytics()
      
      res.json({
        success: true,
        data: analytics.suppliers
      })
    } catch (error: any) {
      logger.error('Ошибка получения аналитики поставщиков', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка получения аналитики поставщиков',
        details: error.message
      })
    }
  }

  /**
   * Получить аналитику категорий
   */
  static getCategoryAnalytics = async (req: Request, res: Response) => {
    try {
      const analytics = await MaterialsAnalyticsService.getFullAnalytics()
      
      res.json({
        success: true,
        data: analytics.categories
      })
    } catch (error: any) {
      logger.error('Ошибка получения аналитики категорий', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка получения аналитики категорий',
        details: error.message
      })
    }
  }

  /**
   * Получить тренды
   */
  static getTrends = async (req: Request, res: Response) => {
    try {
      const analytics = await MaterialsAnalyticsService.getFullAnalytics()
      
      res.json({
        success: true,
        data: analytics.trends
      })
    } catch (error: any) {
      logger.error('Ошибка получения трендов', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка получения трендов',
        details: error.message
      })
    }
  }

  /**
   * Получить рекомендации
   */
  static getRecommendations = async (req: Request, res: Response) => {
    try {
      const analytics = await MaterialsAnalyticsService.getFullAnalytics()
      
      res.json({
        success: true,
        data: analytics.recommendations
      })
    } catch (error: any) {
      logger.error('Ошибка получения рекомендаций', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка получения рекомендаций',
        details: error.message
      })
    }
  }

  /**
   * Экспортировать аналитику
   */
  static exportAnalytics = async (req: Request, res: Response) => {
    try {
      const { format = 'json' } = req.query
      
      const analytics = await MaterialsAnalyticsService.getFullAnalytics()
      
      if (format === 'csv') {
        // Здесь можно добавить экспорт в CSV
        res.setHeader('Content-Type', 'text/csv')
        res.setHeader('Content-Disposition', 'attachment; filename="materials-analytics.csv"')
        res.send('Material ID,Material Name,Category,Supplier,Current Stock,Min Stock,Stock Value,Turnover Rate\n')
        // Добавить данные в CSV формате
      } else {
        res.json({
          success: true,
          data: analytics
        })
      }
    } catch (error: any) {
      logger.error('Ошибка экспорта аналитики', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка экспорта аналитики',
        details: error.message
      })
    }
  }
}
