import { Router } from 'express'
import { PaperTypeController } from '../controllers/paperTypeController'
import { asyncHandler } from '../middleware'

const router = Router()

// Получить все типы бумаги
router.get('/', asyncHandler(PaperTypeController.getAllPaperTypes))

// Получить тип бумаги по ID
router.get('/:id', asyncHandler(PaperTypeController.getPaperTypeById))

// Создать новый тип бумаги
router.post('/', asyncHandler(PaperTypeController.createPaperType))

// Обновить тип бумаги
router.put('/:id', asyncHandler(PaperTypeController.updatePaperType))

// Удалить тип бумаги
router.delete('/:id', asyncHandler(PaperTypeController.deletePaperType))

// Добавить цену печати
router.post('/prices', asyncHandler(PaperTypeController.addPrintingPrice))

// Удалить цену печати
router.delete('/prices/:id', asyncHandler(PaperTypeController.deletePrintingPrice))

// Найти тип бумаги по названию материала
router.get('/find/by-material', asyncHandler(PaperTypeController.findPaperTypeByMaterial))

// Получить цену печати
router.get('/prices/lookup', asyncHandler(PaperTypeController.getPrintingPrice))

export default router

