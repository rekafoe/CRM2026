import { Router } from 'express'
import { AuthController } from '../controllers'
import { asyncHandler } from '../middleware'

const router = Router()

router.post('/login', asyncHandler(AuthController.login))
router.get('/me', asyncHandler(AuthController.getCurrentUser))

export default router
