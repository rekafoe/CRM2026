import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { MaterialTypeController } from '../modules/warehouse/controllers/materialTypeController'

const router = Router()

router.get('/', asyncHandler(MaterialTypeController.getAllTypes))
router.get('/:id', asyncHandler(MaterialTypeController.getTypeById))
router.post('/', asyncHandler(MaterialTypeController.createType))
router.put('/:id', asyncHandler(MaterialTypeController.updateType))
router.delete('/:id', asyncHandler(MaterialTypeController.deleteType))

export default router
