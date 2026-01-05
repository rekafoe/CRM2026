import { Router } from 'express'
import { SupplierController } from '../controllers'
import { SupplierAnalyticsController } from '../controllers/supplierAnalyticsController'
import { asyncHandler } from '../middleware'

const router = Router()

// GET /api/suppliers - получить всех поставщиков
router.get('/', asyncHandler(SupplierController.getAllSuppliers))

// GET /api/suppliers/active - получить активных поставщиков
router.get('/active', asyncHandler(SupplierController.getActiveSuppliers))

// GET /api/suppliers/stats - получить статистику по поставщикам
router.get('/stats', asyncHandler(SupplierController.getSupplierStats))

// GET /api/suppliers/:id - получить поставщика по ID
router.get('/:id', asyncHandler(SupplierController.getSupplierById))

// GET /api/suppliers/:id/materials - получить материалы поставщика
router.get('/:id/materials', asyncHandler(SupplierController.getSupplierMaterials))

// GET /api/suppliers/:id/analytics - получить аналитику поставщика
router.get('/:id/analytics', asyncHandler(SupplierAnalyticsController.getSupplierAnalytics))

// GET /api/suppliers/:id/delivery-history - получить историю поставок
router.get('/:id/delivery-history', asyncHandler(SupplierAnalyticsController.getSupplierDeliveryHistory))

// GET /api/suppliers/analytics/comparison - получить сравнительную аналитику
router.get('/analytics/comparison', asyncHandler(SupplierAnalyticsController.getSuppliersComparison))

// POST /api/suppliers - создать нового поставщика
router.post('/', asyncHandler(SupplierController.createSupplier))

// PUT /api/suppliers/:id - обновить поставщика
router.put('/:id', asyncHandler(SupplierController.updateSupplier))

// DELETE /api/suppliers/:id - удалить поставщика
router.delete('/:id', asyncHandler(SupplierController.deleteSupplier))

export default router
