import { Request, Response } from 'express'
import { MaterialImportExportService } from '../services'
import { AuthenticatedRequest } from '../middleware'

export class MaterialImportExportController {
  // Экспорт в CSV
  static async exportToCSV(req: Request, res: Response) {
    try {
      const { categoryId, supplierId } = req.query as any
      
      const csv = await MaterialImportExportService.exportToCSV({
        categoryId: categoryId ? Number(categoryId) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined
      })
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="materials_${new Date().toISOString().split('T')[0]}.csv"`)
      res.send(csv)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Экспорт в JSON
  static async exportToJSON(req: Request, res: Response) {
    try {
      const { categoryId, supplierId } = req.query as any
      
      const json = await MaterialImportExportService.exportToJSON({
        categoryId: categoryId ? Number(categoryId) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined
      })
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="materials_${new Date().toISOString().split('T')[0]}.json"`)
      res.json(json)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Импорт из JSON
  static async importFromJSON(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const data = req.body
      
      // Валидация данных
      const validation = await MaterialImportExportService.validateImportData(data)
      if (!validation.valid) {
        res.status(400).json({ 
          error: 'Ошибки валидации данных',
          details: validation.errors
        })
        return
      }
      
      const result = await MaterialImportExportService.importFromJSON(data)
      res.json({
        success: true,
        imported: result.results.length,
        errors: result.errors.length,
        results: result.results,
        error_details: result.errors
      })
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Получить шаблон для импорта
  static async getImportTemplate(req: Request, res: Response) {
    try {
      const template = await MaterialImportExportService.getImportTemplate()
      res.json(template)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Валидация данных импорта
  static async validateImportData(req: Request, res: Response) {
    try {
      const data = req.body
      const validation = await MaterialImportExportService.validateImportData(data)
      res.json(validation)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }
}
