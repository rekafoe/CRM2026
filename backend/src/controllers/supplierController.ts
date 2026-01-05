import { Request, Response } from 'express'
import { SupplierService } from '../services'
import { AuthenticatedRequest } from '../middleware'

export class SupplierController {
  static async getAllSuppliers(req: Request, res: Response) {
    try {
      const suppliers = await SupplierService.getAllSuppliers()
      res.json(suppliers)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async getActiveSuppliers(req: Request, res: Response) {
    try {
      const suppliers = await SupplierService.getActiveSuppliers()
      res.json(suppliers)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async getSupplierById(req: Request, res: Response) {
    try {
      const id = Number(req.params.id)
      const supplier = await SupplierService.getSupplierById(id)
      
      if (!supplier) {
        res.status(404).json({ error: 'Поставщик не найден' })
        return
      }
      
      res.json(supplier)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async createSupplier(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const supplier = req.body
      const result = await SupplierService.createSupplier(supplier)
      res.status(201).json(result)
    } catch (error: any) {
      const status = error.status || 500
      res.status(status).json({ error: error.message })
    }
  }

  static async updateSupplier(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const id = Number(req.params.id)
      const supplier = req.body
      const result = await SupplierService.updateSupplier(id, supplier)
      
      if (!result) {
        res.status(404).json({ error: 'Поставщик не найден' })
        return
      }
      
      res.json(result)
    } catch (error: any) {
      const status = error.status || 500
      res.status(status).json({ error: error.message })
    }
  }

  static async deleteSupplier(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const id = Number(req.params.id)
      await SupplierService.deleteSupplier(id)
      res.status(204).end()
    } catch (error: any) {
      const status = error.status || 500
      res.status(status).json({ error: error.message })
    }
  }

  static async getSupplierStats(req: Request, res: Response) {
    try {
      const stats = await SupplierService.getSupplierStats()
      res.json(stats)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async getSupplierMaterials(req: Request, res: Response) {
    try {
      const id = Number(req.params.id)
      const materials = await SupplierService.getSupplierMaterials(id)
      res.json(materials)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }
}
