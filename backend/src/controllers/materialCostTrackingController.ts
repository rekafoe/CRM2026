import { Request, Response } from 'express'
import { MaterialCostTrackingService } from '../services'
import { AuthenticatedRequest } from '../middleware'

export class MaterialCostTrackingController {
  // Получить историю цен материала
  static async getPriceHistory(req: Request, res: Response) {
    try {
      const materialId = Number(req.params.materialId)
      const { limit } = req.query as any
      
      const history = await MaterialCostTrackingService.getPriceHistory(
        materialId,
        limit ? Number(limit) : undefined
      )
      
      res.json(history)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Получить историю цен всех материалов
  static async getAllPriceHistory(req: Request, res: Response) {
    try {
      const { materialId, from, to, limit, offset } = req.query as any
      
      const history = await MaterialCostTrackingService.getAllPriceHistory({
        materialId: materialId ? Number(materialId) : undefined,
        from: from as string,
        to: to as string,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined
      })
      
      res.json(history)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Обновить цену материала
  static async updatePrice(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const materialId = Number(req.params.materialId)
      const { new_price, reason } = req.body as { new_price: number; reason: string }
      
      if (!new_price || new_price < 0) {
        res.status(400).json({ error: 'Неверная цена' })
        return
      }
      
      if (!reason || typeof reason !== 'string') {
        res.status(400).json({ error: 'Необходимо указать причину изменения цены' })
        return
      }
      
      const result = await MaterialCostTrackingService.updatePrice(
        materialId,
        new_price,
        reason,
        user.id
      )
      
      res.json(result)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Получить статистику по ценам
  static async getPriceStats(req: Request, res: Response) {
    try {
      const { materialId, from, to } = req.query as any
      
      const stats = await MaterialCostTrackingService.getPriceStats({
        materialId: materialId ? Number(materialId) : undefined,
        from: from as string,
        to: to as string
      })
      
      res.json(stats)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Получить материалы с изменением цен
  static async getMaterialsWithPriceChanges(req: Request, res: Response) {
    try {
      const { from, to, categoryId, supplierId } = req.query as any
      
      if (!from || !to) {
        res.status(400).json({ error: 'Необходимо указать даты from и to' })
        return
      }
      
      const materials = await MaterialCostTrackingService.getMaterialsWithPriceChanges({
        from: from as string,
        to: to as string,
        categoryId: categoryId ? Number(categoryId) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined
      })
      
      res.json(materials)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Получить тренды цен по категориям
  static async getPriceTrendsByCategory(req: Request, res: Response) {
    try {
      const { from, to } = req.query as any
      
      if (!from || !to) {
        res.status(400).json({ error: 'Необходимо указать даты from и to' })
        return
      }
      
      const trends = await MaterialCostTrackingService.getPriceTrendsByCategory({
        from: from as string,
        to: to as string
      })
      
      res.json(trends)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }
}
