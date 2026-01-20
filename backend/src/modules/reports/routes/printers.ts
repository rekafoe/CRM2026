import { Router } from 'express'
import { asyncHandler } from '../../../middleware'
import { getDb } from '../../../config/database'
import { AuthenticatedRequest } from '../../../middleware'

const router = Router()

// GET /api/printers — список принтеров
router.get('/', asyncHandler(async (req, res) => {
  const db = await getDb()
  const rows = await db.all<any>('SELECT id, code, name FROM printers ORDER BY name')
  res.json(rows)
}))

// GET /api/printers/counters — счётчики принтеров по дате
router.get('/counters', asyncHandler(async (req, res) => {
  const date = String((req.query as any)?.date || '').slice(0, 10)
  if (!date) { res.status(400).json({ message: 'date=YYYY-MM-DD required' }); return }
  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT p.id, p.code, p.name,
            pc.value as value,
            (
              SELECT pc2.value FROM printer_counters pc2
               WHERE pc2.printer_id = p.id AND pc2.counter_date < ?
               ORDER BY pc2.counter_date DESC LIMIT 1
            ) as prev_value
       FROM printers p
  LEFT JOIN printer_counters pc ON pc.printer_id = p.id AND pc.counter_date = ?
      ORDER BY p.name`,
    date,
    date
  )
  res.json(rows)
}))

// POST /api/printers/:id/counters — добавить счётчик принтера (доступно всем авторизованным пользователям)
router.post('/:id/counters', asyncHandler(async (req, res) => {
  const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  if (!user) { res.status(401).json({ message: 'Unauthorized' }); return }
  const id = Number(req.params.id)
  const { counter_date, value } = req.body as { counter_date: string; value: number }
  const db = await getDb()
  try {
    await db.run('INSERT OR REPLACE INTO printer_counters (printer_id, counter_date, value) VALUES (?, ?, ?)', id, counter_date, Number(value))
  } catch (e) { throw e }
  const row = await db.get<any>('SELECT id, printer_id, counter_date, value, created_at FROM printer_counters WHERE printer_id = ? AND counter_date = ?', id, counter_date)
  res.status(201).json(row)
}))

export default router
