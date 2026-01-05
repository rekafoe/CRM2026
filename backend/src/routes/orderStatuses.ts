import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'

const router = Router()

// GET /api/order-statuses — список статусов для фронта
router.get('/', asyncHandler(async (req, res) => {
  const db = await getDb()
  const rows = await db.all<any>(
    'SELECT id, name, color, sort_order FROM order_statuses ORDER BY sort_order'
  )
  res.json(rows)
}))

export default router
