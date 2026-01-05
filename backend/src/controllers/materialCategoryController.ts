import { Request, Response } from 'express'
import { MaterialCategoryService } from '../services'
import { AuthenticatedRequest } from '../middleware'

export class MaterialCategoryController {
  static async getAllCategories(req: Request, res: Response) {
    try {
      const categories = await MaterialCategoryService.getAllCategories()
      res.json(categories)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async getCategoryById(req: Request, res: Response) {
    try {
      const id = Number(req.params.id)
      const category = await MaterialCategoryService.getCategoryById(id)
      
      if (!category) {
        res.status(404).json({ error: 'Категория не найдена' })
        return
      }
      
      res.json(category)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async createCategory(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const category = req.body
      const result = await MaterialCategoryService.createCategory(category)
      res.status(201).json(result)
    } catch (error: any) {
      const status = error.status || 500
      res.status(status).json({ error: error.message })
    }
  }

  static async updateCategory(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const id = Number(req.params.id)
      const category = req.body
      const result = await MaterialCategoryService.updateCategory(id, category)
      
      if (!result) {
        res.status(404).json({ error: 'Категория не найдена' })
        return
      }
      
      res.json(result)
    } catch (error: any) {
      const status = error.status || 500
      res.status(status).json({ error: error.message })
    }
  }

  static async deleteCategory(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const id = Number(req.params.id)
      await MaterialCategoryService.deleteCategory(id)
      res.status(204).end()
    } catch (error: any) {
      const status = error.status || 500
      res.status(status).json({ error: error.message })
    }
  }

  static async getCategoryStats(req: Request, res: Response) {
    try {
      const stats = await MaterialCategoryService.getCategoryStats()
      res.json(stats)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }
}
