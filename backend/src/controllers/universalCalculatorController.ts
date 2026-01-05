import { Request, Response } from 'express'
import { UniversalCalculatorService } from '../services'
import { AuthenticatedRequest } from '../middleware'

export class UniversalCalculatorController {
  // Получить конфигурацию калькулятора
  static async getCalculatorConfig(req: Request, res: Response) {
    try {
      const { productType, productName } = req.query as { productType: string; productName?: string }
      
      if (!productType) {
        res.status(400).json({ error: 'Необходимо указать тип продукта' })
        return
      }
      
      const config = await UniversalCalculatorService.getCalculatorConfig(productType, productName)
      res.json(config)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Получить все типы продуктов
  static async getProductTypes(req: Request, res: Response) {
    try {
      const types = await UniversalCalculatorService.getProductTypes()
      res.json(types)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Получить продукты по типу
  static async getProductsByType(req: Request, res: Response) {
    try {
      const { productType } = req.params
      const products = await UniversalCalculatorService.getProductsByType(productType)
      res.json(products)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Рассчитать стоимость продукта
  static async calculateProductCost(req: Request, res: Response) {
    try {
      const { productType, productName, quantity, options } = req.body as {
        productType: string;
        productName: string;
        quantity: number;
        options?: Record<string, any>;
      }
      
      if (!productType || !productName || !quantity) {
        res.status(400).json({ error: 'Необходимо указать тип продукта, название и количество' })
        return
      }
      
      const result = await UniversalCalculatorService.calculateProductCost(
        productType,
        productName,
        quantity,
        options || {}
      )
      
      res.json(result)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Получить все правила
  static async getAllRules(req: Request, res: Response) {
    try {
      const { product_type, product_name, material_id, is_required } = req.query as any
      
      const rules = await UniversalCalculatorService.getAllRules({
        product_type: product_type as string,
        product_name: product_name as string,
        material_id: material_id ? Number(material_id) : undefined,
        is_required: is_required === 'true' ? true : is_required === 'false' ? false : undefined
      })
      
      res.json(rules)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Создать или обновить правило
  static async createOrUpdateRule(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const rule = req.body
      const result = await UniversalCalculatorService.createOrUpdateRule(rule)
      res.json(result)
    } catch (error: any) {
      const status = error.status || 500
      res.status(status).json({ error: error.message })
    }
  }

  // Удалить правило
  static async deleteRule(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const ruleId = Number(req.params.id)
      await UniversalCalculatorService.deleteRule(ruleId)
      res.status(204).end()
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  // Клонировать правила
  static async cloneRules(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
      if (!user || user.role !== 'admin') { 
        res.status(403).json({ message: 'Forbidden' })
        return 
      }
      
      const { fromProductType, fromProductName, toProductType, toProductName } = req.body as {
        fromProductType: string;
        fromProductName: string;
        toProductType: string;
        toProductName: string;
      }
      
      if (!fromProductType || !fromProductName || !toProductType || !toProductName) {
        res.status(400).json({ error: 'Необходимо указать все параметры для клонирования' })
        return
      }
      
      const result = await UniversalCalculatorService.cloneRules(
        fromProductType,
        fromProductName,
        toProductType,
        toProductName
      )
      
      res.json(result)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }
}
