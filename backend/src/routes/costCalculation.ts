import { Router } from 'express'
import { CostCalculationController } from '../controllers/costCalculationController'
import { authenticate, asyncHandler } from '../middleware'

const router = Router()

// Все маршруты требуют аутентификации
router.use(authenticate)

// Рассчитать себестоимость товара
router.post('/calculate', asyncHandler(CostCalculationController.calculateProductCost))

// Получить историю расчетов
router.get('/history', asyncHandler(CostCalculationController.getCostHistory))

// Сравнить варианты продукта
router.post('/compare', asyncHandler(CostCalculationController.compareProductVariants))

// Анализ прибыльности
router.post('/profitability', asyncHandler(CostCalculationController.getProfitabilityAnalysis))

// Отчет по себестоимости
router.get('/report', asyncHandler(CostCalculationController.getCostReport))

export default router
