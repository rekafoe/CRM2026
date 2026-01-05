import { Request, Response } from 'express'
import { MaterialAlertService } from '../services'
import { AuthenticatedRequest } from '../middleware'

export class MaterialAlertController {
  // Получить все уведомления
  static async getAllAlerts(req: Request, res: Response) {
    try {
      const { is_read, alert_type, material_id, limit, offset } = req.query as any
      
      const alerts = await MaterialAlertService.getAllAlerts({
        is_read: is_read === 'true' ? true : is_read === 'false' ? false : undefined,
        alert_type: alert_type as string,
        material_id: material_id ? Number(material_id) : undefined,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined
      })
      
      res.json(alerts)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Получить непрочитанные уведомления
  static async getUnreadAlerts(req: Request, res: Response) {
    try {
      const alerts = await MaterialAlertService.getUnreadAlerts()
      res.json(alerts)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Отметить уведомление как прочитанное
  static async markAsRead(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      const alertId = Number(req.params.id)
      
      await MaterialAlertService.markAsRead(alertId, user?.id)
      res.status(204).end()
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Отметить все уведомления как прочитанные
  static async markAllAsRead(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      
      await MaterialAlertService.markAllAsRead(user?.id)
      res.status(204).end()
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Удалить уведомление
  static async deleteAlert(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const alertId = Number(req.params.id)
      await MaterialAlertService.deleteAlert(alertId)
      res.status(204).end()
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Проверить и создать уведомления
  static async checkAlerts(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const newAlerts = await MaterialAlertService.checkLowStockAlerts()
      res.json({ created: newAlerts.length, alerts: newAlerts })
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Получить статистику уведомлений
  static async getAlertStats(req: Request, res: Response) {
    try {
      const stats = await MaterialAlertService.getAlertStats()
      res.json(stats)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }
}
