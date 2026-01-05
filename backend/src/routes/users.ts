import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'
import { hashPassword } from '../utils'

const router = Router()

// GET /api/users — список пользователей
router.get('/', asyncHandler(async (req, res) => {
  const db = await getDb()
  const users = await db.all<any>('SELECT id, name FROM users ORDER BY name')
  res.json(users)
}))

// GET /api/users/all — полный список пользователей с деталями
router.get('/all', asyncHandler(async (req, res) => {
  const db = await getDb()
  const users = await db.all<any>(`
    SELECT id, name, email, role, created_at,
           LENGTH(api_token) > 0 as has_api_token
    FROM users
    ORDER BY name
  `)
  res.json(users)
}))

// POST /api/users — создать пользователя
router.post('/', asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body
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

  // Создаем пользователя
  const result = await db.run(`
    INSERT INTO users (name, email, password_hash, role, api_token, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `, [name, email, hashedPassword, role || 'user', apiToken])

  res.json({
    id: result.lastID,
    name,
    email,
    role: role || 'user'
  })
}))

// PUT /api/users/:id — обновить пользователя
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, email, role } = req.body
  const db = await getDb()

  // Проверяем, существует ли другой пользователь с таким email
  const existingUser = await db.get<any>('SELECT id FROM users WHERE email = ? AND id != ?', [email, id])
  if (existingUser) {
    res.status(400).json({ message: 'Пользователь с таким email уже существует' })
    return
  }

  await db.run(`
    UPDATE users
    SET name = ?, email = ?, role = ?
    WHERE id = ?
  `, [name, email, role, id])

  res.json({ message: 'Пользователь обновлен' })
}))

// DELETE /api/users/:id — удалить пользователя
router.delete('/:id', asyncHandler(async (req, res) => {
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

  // Генерируем новый токен
  const newToken = require('crypto').randomBytes(32).toString('hex')

  await db.run('UPDATE users SET api_token = ? WHERE id = ?', [newToken, id])

  res.json({ api_token: newToken })
}))

// POST /api/users/fix-existing — исправить существующих пользователей (одноразовая функция)
router.post('/fix-existing', asyncHandler(async (req, res) => {
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
