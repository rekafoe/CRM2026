import { Router } from 'express'
import { MaterialReportController } from '../controllers'
import { asyncHandler } from '../middleware'

const router = Router()

// GET /api/material-reports/inventory - отчет по остаткам материалов
router.get('/inventory', asyncHandler(MaterialReportController.getInventoryReport))

// GET /api/material-reports/consumption - отчет по расходу материалов
router.get('/consumption', asyncHandler(MaterialReportController.getConsumptionReport))

// GET /api/material-reports/cost - отчет по стоимости материалов
router.get('/cost', asyncHandler(MaterialReportController.getCostReport))

// GET /api/material-reports/summary - сводный отчет
router.get('/summary', asyncHandler(MaterialReportController.getSummaryReport))

// GET /api/material-reports/daily-movement - отчет по движению по дням
router.get('/daily-movement', asyncHandler(MaterialReportController.getDailyMovementReport))

export default router
