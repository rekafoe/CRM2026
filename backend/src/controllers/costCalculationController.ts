import { Request, Response } from 'express'
import { CostCalculationService } from '../services/costCalculationService'
import { logger } from '../utils/logger'
import { AuthenticatedRequest } from '../middleware'

export class CostCalculationController {
  /**
   * Рассчитать себестоимость товара
   */
  static calculateProductCost = async (req: Request, res: Response) => {
    try {
      const { productType, productVariant, quantity, specifications } = req.body

      if (!productType || !productVariant || !quantity) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать productType, productVariant и quantity'
        })
        return
      }

      const result = await CostCalculationService.calculateProductCost(
        productType,
        productVariant,
        Number(quantity),
        specifications
      )

      if (result.success) {
        res.json({
          success: true,
          data: result
        })
      } else {
        res.status(400).json({
          success: false,
          data: result,
          message: 'Ошибка расчета себестоимости'
        })
      }
    } catch (error: any) {
      logger.error('Ошибка расчета себестоимости', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка расчета себестоимости',
        details: error.message
      })
    }
  }

  /**
   * Получить историю расчетов себестоимости
   */
  static getCostHistory = async (req: Request, res: Response) => {
    try {
      const { productId, limit } = req.query
      
      const history = await CostCalculationService.getCostHistory(
        productId as string,
        limit ? Number(limit) : 50
      )
      
      res.json({
        success: true,
        data: history
      })
    } catch (error: any) {
      logger.error('Ошибка получения истории расчетов', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка получения истории расчетов',
        details: error.message
      })
    }
  }

  /**
   * Сравнить варианты продукта
   */
  static compareProductVariants = async (req: Request, res: Response) => {
    try {
      const { productType, variants, quantity } = req.body

      if (!productType || !variants || !Array.isArray(variants) || !quantity) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать productType, variants (массив) и quantity'
        })
        return
      }

      const comparisons = await CostCalculationService.compareProductVariants(
        productType,
        variants,
        Number(quantity)
      )
      
      res.json({
        success: true,
        data: comparisons
      })
    } catch (error: any) {
      logger.error('Ошибка сравнения вариантов продукта', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка сравнения вариантов продукта',
        details: error.message
      })
    }
  }

  /**
   * Получить анализ прибыльности
   */
  static getProfitabilityAnalysis = async (req: Request, res: Response) => {
    try {
      const { productType, productVariant, quantity } = req.body

      if (!productType || !productVariant || !quantity) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать productType, productVariant и quantity'
        })
        return
      }

      const result = await CostCalculationService.calculateProductCost(
        productType,
        productVariant,
        Number(quantity)
      )

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: 'Ошибка расчета себестоимости'
        })
        return
      }

      const { breakdown } = result
      
      // Анализ прибыльности
      const analysis = {
        profitability: {
          profit: breakdown.profit,
          profitMargin: breakdown.profitMargin,
          margin: breakdown.margin,
          isProfitable: breakdown.profit > 0,
          profitabilityLevel: breakdown.profitMargin > 30 ? 'high' : 
                             breakdown.profitMargin > 15 ? 'medium' : 'low'
        },
        costBreakdown: {
          materialCost: breakdown.totalMaterialCost,
          serviceCost: breakdown.totalServiceCost,
          totalCost: breakdown.totalCost,
          materialPercentage: breakdown.totalCost > 0 ? 
            (breakdown.totalMaterialCost / breakdown.totalCost) * 100 : 0,
          servicePercentage: breakdown.totalCost > 0 ? 
            (breakdown.totalServiceCost / breakdown.totalCost) * 100 : 0
        },
        pricing: {
          sellingPrice: breakdown.sellingPrice,
          costPerUnit: breakdown.totalCost / Number(quantity),
          profitPerUnit: breakdown.profit / Number(quantity),
          recommendedPrice: breakdown.totalCost * 1.3, // 30% маржа
          minPrice: breakdown.totalCost * 1.1 // 10% маржа
        },
        recommendations: result.recommendations,
        warnings: result.warnings
      }
      
      res.json({
        success: true,
        data: analysis
      })
    } catch (error: any) {
      logger.error('Ошибка анализа прибыльности', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка анализа прибыльности',
        details: error.message
      })
    }
  }

  /**
   * Получить отчет по себестоимости
   */
  static getCostReport = async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, productType } = req.query
      
      // Здесь можно добавить логику для генерации отчета
      // Пока возвращаем базовую структуру
      const report = {
        period: {
          startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: endDate || new Date().toISOString()
        },
        summary: {
          totalProducts: 0,
          totalCost: 0,
          totalRevenue: 0,
          totalProfit: 0,
          averageMargin: 0
        },
        products: [],
        trends: {
          costTrend: 'stable',
          profitTrend: 'stable',
          marginTrend: 'stable'
        }
      }
      
      res.json({
        success: true,
        data: report
      })
    } catch (error: any) {
      logger.error('Ошибка генерации отчета', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка генерации отчета',
        details: error.message
      })
    }
  }
}
