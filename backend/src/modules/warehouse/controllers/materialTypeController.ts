import { Request, Response } from 'express'
import { AuthenticatedRequest } from '../../../middleware'
import { MaterialTypeService } from '../services/materialTypeService'

export class MaterialTypeController {
  static async getAllTypes(req: Request, res: Response) {
    try {
      const { category_id, search, only_active } = req.query as Record<string, string | undefined>
      const rows = await MaterialTypeService.getAllTypes({
        categoryId: category_id ? Number(category_id) : undefined,
        search: search || undefined,
        onlyActive: only_active === 'true',
      })
      res.json(rows)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async getTypeById(req: Request, res: Response) {
    try {
      const id = Number(req.params.id)
      const row = await MaterialTypeService.getTypeById(id)
      if (!row) {
        res.status(404).json({ error: 'Тип материала не найден' })
        return
      }
      res.json(row)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async createType(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') {
        res.status(403).json({ message: 'Forbidden' })
        return
      }

      const created = await MaterialTypeService.createType(req.body)
      res.status(201).json(created)
    } catch (error: any) {
      const status = error.status || 500
      res.status(status).json({ error: error.message })
    }
  }

  static async updateType(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') {
        res.status(403).json({ message: 'Forbidden' })
        return
      }

      const id = Number(req.params.id)
      const updated = await MaterialTypeService.updateType(id, req.body)
      if (!updated) {
        res.status(404).json({ error: 'Тип материала не найден' })
        return
      }
      res.json(updated)
    } catch (error: any) {
      const status = error.status || 500
      res.status(status).json({ error: error.message })
    }
  }

  static async deleteType(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') {
        res.status(403).json({ message: 'Forbidden' })
        return
      }

      const id = Number(req.params.id)
      await MaterialTypeService.deleteType(id)
      res.status(204).end()
    } catch (error: any) {
      const status = error.status || 500
      res.status(status).json({ error: error.message })
    }
  }
}
