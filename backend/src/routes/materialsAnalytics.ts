import { Router } from 'express'
import { MaterialsAnalyticsController } from '../controllers/materialsAnalyticsController'
import { authenticate, asyncHandler } from '../middleware'

const router = Router()

// Все маршруты требуют аутентификации
router.use(authenticate)

// Получить полную аналитику
router.get('/full', asyncHandler(MaterialsAnalyticsController.getFullAnalytics))

// Получить сводную аналитику
router.get('/summary', asyncHandler(MaterialsAnalyticsController.getSummaryAnalytics))

// Получить аналитику по конкретному материалу
router.get('/material/:materialId', asyncHandler(MaterialsAnalyticsController.getMaterialAnalytics))

// Получить аналитику потребления
router.get('/consumption', asyncHandler(MaterialsAnalyticsController.getConsumptionAnalytics))

// Получить аналитику поставщиков
router.get('/suppliers', asyncHandler(MaterialsAnalyticsController.getSupplierAnalytics))

// Получить аналитику категорий
router.get('/categories', asyncHandler(MaterialsAnalyticsController.getCategoryAnalytics))

// Получить тренды
router.get('/trends', asyncHandler(MaterialsAnalyticsController.getTrends))

// Получить рекомендации
router.get('/recommendations', asyncHandler(MaterialsAnalyticsController.getRecommendations))

// Экспортировать аналитику
router.get('/export', asyncHandler(MaterialsAnalyticsController.exportAnalytics))

export default router
