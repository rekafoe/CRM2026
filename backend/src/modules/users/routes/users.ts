import { Router } from 'express'
import { asyncHandler } from '../../../middleware'
import { getDb } from '../../../config/database'

const router = Router()

// GET /api/users — список пользователей
router.get('/', asyncHandler(async (req, res) => {
  const db = await getDb()
  const users = await db.all<any>('SELECT id, name FROM users ORDER BY name')
  res.json(users)
}))


export default router
