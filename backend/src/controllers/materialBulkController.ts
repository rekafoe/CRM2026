import { Request, Response } from 'express'
import { MaterialBulkService } from '../services'
import { AuthenticatedRequest } from '../middleware'

export class MaterialBulkController {
  // Массовое обновление материалов
  static async bulkUpdateMaterials(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const { updates } = req.body as { updates: any[] }
      
      if (!Array.isArray(updates) || updates.length === 0) {
        res.status(400).json({ error: 'Необходимо передать массив обновлений' })
        return
      }
      
      const results = await MaterialBulkService.bulkUpdateMaterials(updates)
      res.json({ updated: results.length, materials: results })
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Массовое списание материалов
  static async bulkSpendMaterials(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const { spends } = req.body as { spends: any[] }
      
      if (!Array.isArray(spends) || spends.length === 0) {
        res.status(400).json({ error: 'Необходимо передать массив списаний' })
        return
      }
      
      const results = await MaterialBulkService.bulkSpendMaterials(spends, user.id)
      res.json({ processed: results.length, results })
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Массовое создание материалов
  static async bulkCreateMaterials(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const { materials } = req.body as { materials: any[] }
      
      if (!Array.isArray(materials) || materials.length === 0) {
        res.status(400).json({ error: 'Необходимо передать массив материалов' })
        return
      }
      
      const results = await MaterialBulkService.bulkCreateMaterials(materials)
      res.json({ created: results.length, materials: results })
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Массовое удаление материалов
  static async bulkDeleteMaterials(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const { materialIds } = req.body as { materialIds: number[] }
      
      if (!Array.isArray(materialIds) || materialIds.length === 0) {
        res.status(400).json({ error: 'Необходимо передать массив ID материалов' })
        return
      }
      
      const results = await MaterialBulkService.bulkDeleteMaterials(materialIds)
      res.json({ processed: results.length, results })
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Массовое изменение категории
  static async bulkChangeCategory(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const { materialIds, categoryId } = req.body as { materialIds: number[]; categoryId: number }
      
      if (!Array.isArray(materialIds) || materialIds.length === 0) {
        res.status(400).json({ error: 'Необходимо передать массив ID материалов' })
        return
      }
      
      if (!categoryId) {
        res.status(400).json({ error: 'Необходимо указать ID категории' })
        return
      }
      
      const result = await MaterialBulkService.bulkChangeCategory(materialIds, categoryId)
      res.json(result)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Массовое изменение поставщика
  static async bulkChangeSupplier(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const { materialIds, supplierId } = req.body as { materialIds: number[]; supplierId: number }
      
      if (!Array.isArray(materialIds) || materialIds.length === 0) {
        res.status(400).json({ error: 'Необходимо передать массив ID материалов' })
        return
      }
      
      if (!supplierId) {
        res.status(400).json({ error: 'Необходимо указать ID поставщика' })
        return
      }
      
      const result = await MaterialBulkService.bulkChangeSupplier(materialIds, supplierId)
      res.json(result)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }
}
