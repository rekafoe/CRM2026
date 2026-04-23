import { Router } from 'express';
import { asyncHandler } from '../middleware';
import { authRateLimit } from '../middleware/rateLimiter';
import { uploadOrderFilesMemory } from '../config/upload';
import { MiniappAuthController } from '../controllers/miniappAuthController';
import { MiniappCheckoutController } from '../controllers/miniappCheckoutController';
import { MiniappOrderController } from '../controllers/miniappOrderController';

const router = Router();

router.post('/auth', authRateLimit, asyncHandler(MiniappAuthController.auth));
router.get('/me', asyncHandler(MiniappAuthController.me));
router.post('/checkout', asyncHandler(MiniappCheckoutController.checkout));
router.get('/orders', asyncHandler(MiniappOrderController.list));
router.get(
  '/orders/:orderId/files/:fileId',
  asyncHandler(MiniappOrderController.downloadFile)
);
router.get('/orders/:orderId', asyncHandler(MiniappOrderController.getOne));
router.post(
  '/orders/:orderId/files',
  uploadOrderFilesMemory.single('file'),
  asyncHandler(MiniappOrderController.uploadFile)
);

export default router;
