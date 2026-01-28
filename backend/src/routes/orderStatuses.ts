import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'
import { getCachedData } from '../utils/dataCache'

const router = Router()

// GET /api/order-statuses — список статусов для фронта
router.get('/', asyncHandler(async (req, res) => {
  const rows = await getCachedData(
    'order_statuses_full',
    async () => {
      const db = await getDb()
      return await db.all<any>(
        'SELECT id, name, color, sort_order FROM order_statuses ORDER BY sort_order'
      )
    },
    30 * 60 * 1000 // 30 минут
  )
  res.json(rows)
}))

export default router
