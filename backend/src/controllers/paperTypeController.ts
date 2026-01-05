import { Request, Response } from 'express'
import { PaperTypeService } from '../services/paperTypeService'
import { asyncHandler } from '../middleware'
import { AuthenticatedRequest } from '../middleware'

export class PaperTypeController {
  // Получить все типы бумаги
  static getAllPaperTypes = asyncHandler(async (req: Request, res: Response) => {
    const paperTypes = await PaperTypeService.getAllPaperTypes()
    res.json(paperTypes)
  })

  // Получить тип бумаги по ID
  static getPaperTypeById = asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const paperType = await PaperTypeService.getPaperTypeWithMaterials(id)
    
    if (!paperType) {
      res.status(404).json({ error: 'Тип бумаги не найден' })
      return
    }
    
    res.json(paperType)
  })

  // Создать новый тип бумаги
  static createPaperType = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
    if (!user || user.role !== 'admin') {
      res.status(403).json({ message: 'Forbidden' })
      return
    }

    const { name, display_name, search_keywords, is_active = true } = req.body

    if (!name || !display_name || !search_keywords) {
      res.status(400).json({ error: 'name, display_name и search_keywords обязательны' })
      return
    }

    const paperType = await PaperTypeService.createPaperType({
      name,
      display_name,
      search_keywords,
      is_active
    })
    res.status(201).json(paperType)
  })

  // Обновить тип бумаги
  static updatePaperType = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
    if (!user || user.role !== 'admin') {
      res.status(403).json({ message: 'Forbidden' })
      return
    }

    const id = Number(req.params.id)
    const updates = req.body

    const paperType = await PaperTypeService.updatePaperType(id, updates)
    res.json(paperType)
  })

  // Удалить тип бумаги
  static deletePaperType = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
    if (!user || user.role !== 'admin') {
      res.status(403).json({ message: 'Forbidden' })
      return
    }

    const id = Number(req.params.id)
    await PaperTypeService.deletePaperType(id)
    res.status(204).end()
  })

  // Добавить цену печати
  static addPrintingPrice = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
    if (!user || user.role !== 'admin') {
      res.status(403).json({ message: 'Forbidden' })
      return
    }

    const { paper_type_id, density, price } = req.body

    if (!paper_type_id || !density || !price) {
      res.status(400).json({ error: 'paper_type_id, density и price обязательны' })
      return
    }

    // const printingPrice = await PaperTypeService.addPrintingPrice(paper_type_id, density, price)
    const printingPrice = { id: 1, paper_type_id, density, price } // Временная заглушка
    res.status(201).json(printingPrice)
  })

  // Удалить цену печати
  static deletePrintingPrice = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
    if (!user || user.role !== 'admin') {
      res.status(403).json({ message: 'Forbidden' })
      return
    }

    const id = Number(req.params.id)
    // await PaperTypeService.deletePrintingPrice(id)
    console.log('Delete printing price:', id) // Временная заглушка
    res.status(204).end()
  })

  // Найти тип бумаги по названию материала
  static findPaperTypeByMaterial = asyncHandler(async (req: Request, res: Response) => {
    const { materialName } = req.query

    if (!materialName) {
      res.status(400).json({ error: 'materialName обязателен' })
      return
    }

    const paperType = await PaperTypeService.findPaperTypeByMaterialName(materialName as string)
    res.json(paperType)
  })

  // Получить цену печати
  static getPrintingPrice = asyncHandler(async (req: Request, res: Response) => {
    const { paper_type_id, density } = req.query

    if (!paper_type_id || !density) {
      res.status(400).json({ error: 'paper_type_id и density обязательны' })
      return
    }

    // const price = await PaperTypeService.getPrintingPrice(
    //   Number(paper_type_id),
    //   Number(density)
    // )
    const price = 0.5 // Временная заглушка

    if (price === null) {
      res.status(404).json({ error: 'Цена не найдена' })
      return
    }

    res.json({ price })
  })
}

