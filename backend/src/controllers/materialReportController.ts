import { Request, Response } from 'express'
import { MaterialReportService } from '../services'
import { AuthenticatedRequest } from '../middleware'

export class MaterialReportController {
  // Отчет по остаткам материалов
  static async getInventoryReport(req: Request, res: Response) {
    try {
      const { categoryId, supplierId, lowStockOnly } = req.query as any
      
      const report = await MaterialReportService.getInventoryReport({
        categoryId: categoryId ? Number(categoryId) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined,
        lowStockOnly: lowStockOnly === 'true'
      })
      
      res.json(report)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Отчет по расходу материалов
  static async getConsumptionReport(req: Request, res: Response) {
    try {
      const { from, to, categoryId, supplierId, materialId } = req.query as any
      
      if (!from || !to) {
        res.status(400).json({ error: 'Необходимо указать даты from и to' })
        return
      }
      
      const report = await MaterialReportService.getConsumptionReport({
        from: from as string,
        to: to as string,
        categoryId: categoryId ? Number(categoryId) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined,
        materialId: materialId ? Number(materialId) : undefined
      })
      
      res.json(report)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Отчет по стоимости материалов
  static async getCostReport(req: Request, res: Response) {
    try {
      const { categoryId, supplierId } = req.query as any
      
      const report = await MaterialReportService.getCostReport({
        categoryId: categoryId ? Number(categoryId) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined
      })
      
      res.json(report)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Сводный отчет
  static async getSummaryReport(req: Request, res: Response) {
    try {
      const report = await MaterialReportService.getSummaryReport()
      res.json(report)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Отчет по движению материалов по дням
  static async getDailyMovementReport(req: Request, res: Response) {
    try {
      const { from, to, categoryId, supplierId } = req.query as any
      
      if (!from || !to) {
        res.status(400).json({ error: 'Необходимо указать даты from и to' })
        return
      }
      
      const report = await MaterialReportService.getDailyMovementReport({
        from: from as string,
        to: to as string,
        categoryId: categoryId ? Number(categoryId) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined
      })
      
      res.json(report)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }
}
