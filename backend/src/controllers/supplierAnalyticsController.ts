import { Request, Response } from 'express';
import { SupplierAnalyticsService } from '../services/supplierAnalyticsService';

export class SupplierAnalyticsController {
  /**
   * Получить полную аналитику поставщика
   */
  static async getSupplierAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const supplierId = parseInt(id);
      
      if (isNaN(supplierId)) {
        res.status(400).json({ error: 'Неверный ID поставщика' });
        return;
      }
      
      const analytics = await SupplierAnalyticsService.getSupplierAnalytics(supplierId);
      res.json(analytics);
    } catch (error) {
      console.error('Ошибка получения аналитики поставщика:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }

  /**
   * Получить историю поставок поставщика
   */
  static async getSupplierDeliveryHistory(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { limit = 50 } = req.query;
      const supplierId = parseInt(id);
      const limitNum = parseInt(limit as string);
      
      if (isNaN(supplierId)) {
        res.status(400).json({ error: 'Неверный ID поставщика' });
        return;
      }
      
      const history = await SupplierAnalyticsService.getSupplierDeliveryHistory(
        supplierId, 
        isNaN(limitNum) ? 50 : limitNum
      );
      
      res.json(history);
    } catch (error) {
      console.error('Ошибка получения истории поставок:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }

  /**
   * Получить сравнительную аналитику всех поставщиков
   */
  static async getSuppliersComparison(req: Request, res: Response): Promise<void> {
    try {
      // Получаем список всех активных поставщиков
      const db = await import('../config/database').then(m => m.getDb());
      const suppliers = await db.all(`
        SELECT id, name FROM suppliers WHERE is_active = 1
      `);
      
      // Получаем аналитику для каждого поставщика
      const comparison = await Promise.all(
        suppliers.map(async (supplier: any) => {
          try {
            const analytics = await SupplierAnalyticsService.getSupplierAnalytics(supplier.id);
            return {
              supplier_id: supplier.id,
              supplier_name: supplier.name,
              overall_score: analytics.overall_score,
              total_deliveries: analytics.delivery_stats.total_deliveries,
              total_value: analytics.delivery_stats.total_value,
              reliability_score: analytics.delivery_stats.reliability_score,
              price_trend: analytics.financial_stats.price_trend,
              materials_count: analytics.usage_stats.materials_count
            };
          } catch (error) {
            console.error(`Ошибка получения аналитики для поставщика ${supplier.id}:`, error);
            return {
              supplier_id: supplier.id,
              supplier_name: supplier.name,
              overall_score: 0,
              total_deliveries: 0,
              total_value: 0,
              reliability_score: 0,
              price_trend: 'stable' as const,
              materials_count: 0
            };
          }
        })
      );
      
      // Сортируем по общему рейтингу
      comparison.sort((a, b) => b.overall_score - a.overall_score);
      
      res.json(comparison);
    } catch (error) {
      console.error('Ошибка получения сравнительной аналитики:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }
}

