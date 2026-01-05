import { Router } from 'express'
import { UniversalCalculatorController } from '../controllers'
import { asyncHandler } from '../middleware'

const router = Router()

// GET /api/universal-calculator/config - получить конфигурацию калькулятора
router.get('/config', asyncHandler(UniversalCalculatorController.getCalculatorConfig))

// GET /api/universal-calculator/product-types - получить все типы продуктов
router.get('/product-types', asyncHandler(UniversalCalculatorController.getProductTypes))

// GET /api/universal-calculator/products/:productType - получить продукты по типу
router.get('/products/:productType', asyncHandler(UniversalCalculatorController.getProductsByType))

// GET /api/universal-calculator/rules - получить все правила
router.get('/rules', asyncHandler(UniversalCalculatorController.getAllRules))

// POST /api/universal-calculator/calculate - рассчитать стоимость продукта
router.post('/calculate', asyncHandler(UniversalCalculatorController.calculateProductCost))

// POST /api/universal-calculator/rules - создать или обновить правило
router.post('/rules', asyncHandler(UniversalCalculatorController.createOrUpdateRule))

// PUT /api/universal-calculator/rules/:id - обновить правило
router.put('/rules/:id', asyncHandler(UniversalCalculatorController.createOrUpdateRule))

// DELETE /api/universal-calculator/rules/:id - удалить правило
router.delete('/rules/:id', asyncHandler(UniversalCalculatorController.deleteRule))

// POST /api/universal-calculator/clone-rules - клонировать правила
router.post('/clone-rules', asyncHandler(UniversalCalculatorController.cloneRules))

export default router
