import { Router } from 'express'
import { SupplierController } from '../controllers/supplierController'
import { asyncHandler } from '../../../middleware'

const router = Router()

router.get('/', asyncHandler(SupplierController.getAllSuppliers))
router.get('/active', asyncHandler(SupplierController.getActiveSuppliers))
router.get('/:id', asyncHandler(SupplierController.getSupplierById))
router.post('/', asyncHandler(SupplierController.createSupplier))
router.put('/:id', asyncHandler(SupplierController.updateSupplier))
router.delete('/:id', asyncHandler(SupplierController.deleteSupplier))
router.get('/:id/materials', asyncHandler(SupplierController.getSupplierMaterials))
router.get('/stats/overview', asyncHandler(SupplierController.getSupplierStats))

export default router
