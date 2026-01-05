import { Router } from 'express'
import { MaterialAlertController } from '../controllers'
import { asyncHandler } from '../middleware'

const router = Router()

// GET /api/material-alerts - получить все уведомления
router.get('/', asyncHandler(MaterialAlertController.getAllAlerts))

// GET /api/material-alerts/unread - получить непрочитанные уведомления
router.get('/unread', asyncHandler(MaterialAlertController.getUnreadAlerts))

// GET /api/material-alerts/stats - получить статистику уведомлений
router.get('/stats', asyncHandler(MaterialAlertController.getAlertStats))

// POST /api/material-alerts/check - проверить и создать уведомления
router.post('/check', asyncHandler(MaterialAlertController.checkAlerts))

// PUT /api/material-alerts/:id/read - отметить как прочитанное
router.put('/:id/read', asyncHandler(MaterialAlertController.markAsRead))

// PUT /api/material-alerts/read-all - отметить все как прочитанные
router.put('/read-all', asyncHandler(MaterialAlertController.markAllAsRead))

// DELETE /api/material-alerts/:id - удалить уведомление
router.delete('/:id', asyncHandler(MaterialAlertController.deleteAlert))

export default router
