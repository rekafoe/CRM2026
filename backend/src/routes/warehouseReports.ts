import { Router } from 'express'
import { WarehouseReportsController } from '../controllers/warehouseReportsController'
import { authenticate } from '../middleware/auth'

const router = Router()

// Отчеты склада доступны публично (для просмотра)

// Сводка склада
router.get('/summary', WarehouseReportsController.getSummary)

// Дефицитные материалы
router.get('/low-stock', WarehouseReportsController.getLowStockItems)

// Сводка по поставщикам
router.get('/suppliers', WarehouseReportsController.getSupplierSummary)

// Движения материалов
router.get('/movements', WarehouseReportsController.getMaterialMovements)

// Сводка по категориям
router.get('/categories', WarehouseReportsController.getCategorySummary)

// Генерация PDF отчета
router.get('/pdf/:reportType', WarehouseReportsController.generatePdfReport)

// Расширенная аналитика
router.get('/abc-analysis', WarehouseReportsController.getABCAnalysis)
router.get('/turnover-analysis', WarehouseReportsController.getTurnoverAnalysis)
router.get('/cost-analysis', WarehouseReportsController.getCostAnalysis)
router.get('/supplier-analytics', WarehouseReportsController.getSupplierAnalytics)
router.get('/forecasting', WarehouseReportsController.getForecastingData)

export default router
