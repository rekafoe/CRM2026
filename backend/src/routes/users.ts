import { Router } from 'express'
import { asyncHandler, AuthenticatedRequest } from '../middleware'
import { getDb } from '../config/database'
import { hashPassword } from '../utils'

const router = Router()

function requireAdmin(req: AuthenticatedRequest, res: any, next: any) {
  const actor = req.user
  if (!actor) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
  if (actor.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  next()
}

// GET /api/users — список пользователей
router.get('/', requireAdmin, asyncHandler(async (req, res) => {
  const db = await getDb()
  const users = await db.all<any>('SELECT id, name FROM users ORDER BY name')
  res.json(users)
}))

// GET /api/users/operators-today?date=YYYY-MM-DD — операторы, работающие в указанную дату (по user_shifts)
router.get('/operators-today', requireAdmin, asyncHandler(async (req, res) => {
  const date = String((req.query as any)?.date ?? '').trim().slice(0, 10)
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    res.status(400).json({ message: 'date=YYYY-MM-DD required' })
    return
  }
  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT u.id, u.name
     FROM user_shifts s
     JOIN users u ON u.id = s.user_id
     WHERE s.work_date = ?
     ORDER BY u.name`,
    targetDate
  )
  res.json(rows)
}))

// GET /api/users/all — полный список пользователей с деталями
router.get('/all', requireAdmin, asyncHandler(async (req, res) => {
  const db = await getDb()
  const users = await db.all<any>(`
    SELECT u.id, u.name, u.email, u.role, u.created_at,
           LENGTH(u.api_token) > 0 as has_api_token,
           u.department_id,
           d.name as department_name
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    ORDER BY u.name
  `)
  res.json(users)
}))

// POST /api/users — создать пользователя
router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  const { name, email, password, role, department_id } = req.body
  const db = await getDb()

  // Проверяем, существует ли пользователь с таким email
  const existingUser = await db.get<any>('SELECT id FROM users WHERE email = ?', [email])
  if (existingUser) {
    res.status(400).json({ message: 'Пользователь с таким email уже существует' })
    return
  }

  // Хэшируем пароль
  const hashedPassword = hashPassword(password)

  // Генерируем API токен
  const apiToken = require('crypto').randomBytes(32).toString('hex')

  const deptId = department_id != null && department_id !== '' ? Number(department_id) : null
  const result = await db.run(`
    INSERT INTO users (name, email, password_hash, role, api_token, department_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `, [name, email, hashedPassword, role || 'user', apiToken, Number.isFinite(deptId) ? deptId : null])

  res.json({
    id: result.lastID,
    name,
    email,
    role: role || 'user',
    department_id: Number.isFinite(deptId) ? deptId : null
  })
}))

// PUT /api/users/:id — обновить пользователя
router.put('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, email, role, department_id } = req.body
  const db = await getDb()

  // Проверяем, существует ли другой пользователь с таким email
  const existingUser = await db.get<any>('SELECT id FROM users WHERE email = ? AND id != ?', [email, id])
  if (existingUser) {
    res.status(400).json({ message: 'Пользователь с таким email уже существует' })
    return
  }

  const deptId = department_id != null && department_id !== '' ? Number(department_id) : null
  await db.run(`
    UPDATE users
    SET name = ?, email = ?, role = ?, department_id = ?
    WHERE id = ?
  `, [name, email, role, Number.isFinite(deptId) ? deptId : null, id])

  res.json({ message: 'Пользователь обновлен' })
}))

// DELETE /api/users/:id — удалить пользователя
router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params
  const db = await getDb()

  // Проверяем, есть ли заказы у пользователя
  const userOrders = await db.get<any>('SELECT COUNT(*) as count FROM orders WHERE userId = ?', [id])
  if (userOrders.count > 0) {
    res.status(400).json({ message: 'Нельзя удалить пользователя с активными заказами' })
    return
  }

  await db.run('DELETE FROM users WHERE id = ?', [id])
  res.json({ message: 'Пользователь удален' })
}))

// POST /api/users/:id/reset-token — сбросить API токен
router.post('/:id/reset-token', asyncHandler(async (req, res) => {
  const { id } = req.params
  const db = await getDb()

  const actor = (req as AuthenticatedRequest).user
  if (!actor) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }

  const targetId = Number(id)
  if (!Number.isFinite(targetId) || targetId <= 0) {
    res.status(400).json({ message: 'Некорректный id пользователя' })
    return
  }

  // Только админ или сам пользователь
  if (actor.role !== 'admin' && actor.id !== targetId) {
    res.status(403).json({ message: 'Недостаточно прав для сброса токена другого пользователя' })
    return
  }

  // Генерируем новый токен
  const newToken = require('crypto').randomBytes(32).toString('hex')

  await db.run('UPDATE users SET api_token = ? WHERE id = ?', [newToken, id])

  res.json({ api_token: newToken })
}))

// POST /api/users/fix-existing — исправить существующих пользователей (одноразовая функция)
router.post('/fix-existing', requireAdmin, asyncHandler(async (req, res) => {
  const db = await getDb()

  // Найти пользователей с пустыми API токенами
  const usersWithoutTokens = await db.all<any>('SELECT id, name FROM users WHERE api_token = "" OR api_token IS NULL')

  let fixedCount = 0
  for (const user of usersWithoutTokens) {
    const apiToken = require('crypto').randomBytes(32).toString('hex')
    await db.run('UPDATE users SET api_token = ? WHERE id = ?', [apiToken, user.id])
    fixedCount++
  }

  res.json({
    message: `Исправлено ${fixedCount} пользователей`,
    fixedUsers: usersWithoutTokens.length
  })
}))

export default router
