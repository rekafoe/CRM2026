import { Request, Response } from 'express'
import { MaterialService } from '../services/materialService'
import { AuthenticatedRequest } from '../../../middleware'
import { WarehouseTransactionService } from '../services/warehouseTransactionService'
import { logger } from '../../../utils/logger'

export class MaterialController {
  static async getAllMaterials(req: Request, res: Response) {
    try {
      const {
        categoryId,
        category,
        finish,
        minDensity,
        maxDensity,
        search,
        onlyActive
      } = req.query as Record<string, string | undefined>;

      const materials = await MaterialService.getAllMaterials({
        categoryId: categoryId ? Number(categoryId) : undefined,
        category: category || undefined,
        finish: finish || undefined,
        minDensity: minDensity ? Number(minDensity) : undefined,
        maxDensity: maxDensity ? Number(maxDensity) : undefined,
        search: search || undefined,
        onlyActive: onlyActive === 'true'
      });

      res.json(materials);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getMaterialById(req: Request, res: Response) {
    try {
      const id = Number(req.params.id)
      const material = await MaterialService.getMaterialById(id)
      
      if (!material) {
        res.status(404).json({ error: 'Material not found' })
        return
      }
      
      res.json(material)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async createOrUpdateMaterial(req: Request, res: Response) {
    try {
      logger.debug('Контроллер создания материала', { headers: req.headers, body: req.body });
      
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        logger.warn('Доступ запрещен - пользователь не админ');
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      logger.debug('Пользователь авторизован', { userId: user.id, role: user.role });
      
      const material = req.body
      const result = await MaterialService.createOrUpdateMaterial(material)
      logger.info('Материал создан/обновлен успешно');
      res.json(result)
    } catch (error: any) {
      logger.error('Ошибка в контроллере создания материала', error);
      const status = error.status || 500
      res.status(status).json({ error: error.message })
    }
  }

  static async updateMaterial(req: Request, res: Response) {
    try {
      logger.debug('PUT /api/materials/:id', { params: req.params, body: req.body });
      
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const id = Number(req.params.id)
      const material = req.body
      const result = await MaterialService.updateMaterial(id, material)
      res.json(result)
    } catch (error: any) {
      logger.error('Ошибка в updateMaterial контроллере', error);
      const status = error.status || 500
      res.status(status).json({ error: error.message })
    }
  }

  static async deleteMaterial(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const id = Number(req.params.id)
      
      if (!id || isNaN(id)) {
        res.status(400).json({ error: 'Некорректный ID материала' })
        return
      }
      
      await MaterialService.deleteMaterial(id)
      res.status(204).end()
    } catch (error: any) {
      logger.error('Ошибка удаления материала', error)
      
      // Обрабатываем разные типы ошибок
      if (error.message && error.message.includes('не найден')) {
        res.status(404).json({ error: error.message })
      } else if (error.message && error.message.includes('используется')) {
        res.status(400).json({ error: error.message })
      } else {
        res.status(500).json({ 
          error: error.message || 'Ошибка при удалении материала',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        })
      }
    }
  }

  static async getLowStockMaterials(req: Request, res: Response) {
    try {
      const materials = await MaterialService.getLowStockMaterials()
      res.json(materials)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async getMaterialMoves(req: Request, res: Response) {
    try {
      const { 
        materialId, user_id, orderId, from, to, categoryId, supplierId, reason, 
        limit, offset 
      } = req.query as any
      
      const moves = await MaterialService.getMaterialMoves({
        materialId: materialId ? Number(materialId) : undefined,
        user_id: user_id ? Number(user_id) : undefined,
        orderId: orderId ? Number(orderId) : undefined,
        from: from as string,
        to: to as string,
        categoryId: categoryId ? Number(categoryId) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined,
        reason: reason as string,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined
      })
      res.json(moves)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async getMaterialMovesStats(req: Request, res: Response) {
    try {
      const { 
        materialId, user_id, orderId, from, to, categoryId, supplierId 
      } = req.query as any
      
      const stats = await MaterialService.getMaterialMovesStats({
        materialId: materialId ? Number(materialId) : undefined,
        user_id: user_id ? Number(user_id) : undefined,
        orderId: orderId ? Number(orderId) : undefined,
        from: from as string,
        to: to as string,
        categoryId: categoryId ? Number(categoryId) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined
      })
      res.json(stats)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async spendMaterial(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const { materialId, delta, reason, orderId } = req.body as { 
        materialId: number; 
        delta: number; 
        reason?: string; 
        orderId?: number 
      }
      
      const opQuantity = Math.abs(delta)
      const result = delta < 0
        ? await WarehouseTransactionService.spendMaterial(materialId, opQuantity, reason || 'Списание материала', orderId, user.id)
        : await WarehouseTransactionService.addMaterial(materialId, opQuantity, reason || 'Поступление материала', orderId, user.id)

      res.json(result)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }
}
