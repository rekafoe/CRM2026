import { Router } from 'express'
import { MaterialBulkController } from '../controllers'
import { asyncHandler } from '../middleware'

const router = Router()

// POST /api/material-bulk/update - массовое обновление материалов
router.post('/update', asyncHandler(MaterialBulkController.bulkUpdateMaterials))

// POST /api/material-bulk/spend - массовое списание материалов
router.post('/spend', asyncHandler(MaterialBulkController.bulkSpendMaterials))

// POST /api/material-bulk/create - массовое создание материалов
router.post('/create', asyncHandler(MaterialBulkController.bulkCreateMaterials))

// POST /api/material-bulk/delete - массовое удаление материалов
router.post('/delete', asyncHandler(MaterialBulkController.bulkDeleteMaterials))

// POST /api/material-bulk/change-category - массовое изменение категории
router.post('/change-category', asyncHandler(MaterialBulkController.bulkChangeCategory))

// POST /api/material-bulk/change-supplier - массовое изменение поставщика
router.post('/change-supplier', asyncHandler(MaterialBulkController.bulkChangeSupplier))

export default router
