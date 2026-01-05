import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'

const router = Router()

// POST /api/webhooks/bepaid — обработчик вебхуков статуса оплаты
router.post('/bepaid', asyncHandler(async (req, res) => {
  const { payment_id, status, order_id } = req.body as { payment_id: string; status: string; order_id: number }
  if (!payment_id) { res.status(400).json({}); return }
  const db = await getDb()
  await db.run('UPDATE orders SET prepaymentStatus = ? WHERE paymentId = ?', status, payment_id)
  res.status(204).end()
}))

export default router
