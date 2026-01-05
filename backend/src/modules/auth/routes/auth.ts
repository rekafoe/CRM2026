import { Router } from 'express'
import { AuthController } from '../controllers/authController'
import { authMiddleware } from '../../../middleware'

const router = Router()

router.post('/login', AuthController.login)
router.get('/me', authMiddleware, AuthController.getCurrentUser)

export default router
