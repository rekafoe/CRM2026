import { Router } from 'express'
import { MaterialAlertController } from '../controllers/materialAlertController'
import { asyncHandler } from '../../../middleware'

const router = Router()

// List all alerts
router.get('/', asyncHandler(MaterialAlertController.getAllAlerts))
// Unread alerts
router.get('/unread', asyncHandler(MaterialAlertController.getUnreadAlerts))
// Mark one as read
router.post('/:id/read', asyncHandler(MaterialAlertController.markAsRead))
// Mark all as read
router.post('/read-all', asyncHandler(MaterialAlertController.markAllAsRead))
// Delete alert
router.delete('/:id', asyncHandler(MaterialAlertController.deleteAlert))
// Check alerts
router.post('/check', asyncHandler(MaterialAlertController.checkAlerts))
// Stats
router.get('/stats', asyncHandler(MaterialAlertController.getAlertStats))

export default router
