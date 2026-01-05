import { Router } from 'express'
import { MaterialCostTrackingController } from '../controllers'
import { asyncHandler } from '../middleware'

const router = Router()

// GET /api/material-cost-tracking/history - получить историю цен всех материалов
router.get('/history', asyncHandler(MaterialCostTrackingController.getAllPriceHistory))

// GET /api/material-cost-tracking/history/:materialId - получить историю цен материала
router.get('/history/:materialId', asyncHandler(MaterialCostTrackingController.getPriceHistory))

// GET /api/material-cost-tracking/stats - получить статистику по ценам
router.get('/stats', asyncHandler(MaterialCostTrackingController.getPriceStats))

// GET /api/material-cost-tracking/price-changes - получить материалы с изменением цен
router.get('/price-changes', asyncHandler(MaterialCostTrackingController.getMaterialsWithPriceChanges))

// GET /api/material-cost-tracking/trends - получить тренды цен по категориям
router.get('/trends', asyncHandler(MaterialCostTrackingController.getPriceTrendsByCategory))

// PUT /api/material-cost-tracking/price/:materialId - обновить цену материала
router.put('/price/:materialId', asyncHandler(MaterialCostTrackingController.updatePrice))

export default router
