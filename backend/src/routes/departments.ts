import { Router } from 'express'
import { asyncHandler, AuthenticatedRequest } from '../middleware'
import { getDb } from '../config/database'

const router = Router()

function requireAdmin(req: AuthenticatedRequest, res: any): boolean {
  const user = req.user
  if (!user) {
    res.status(401).json({ message: 'Unauthorized' })
    return false
  }
  if (user.role !== 'admin') {
    res.status(403).json({ message: 'Только администратор может изменять департаменты' })
    return false
  }
  return true
}

/**
 * @swagger
 * /api/departments:
 *   get:
 *     summary: Список департаментов
 *     description: Возвращает все департаменты, отсортированные по sort_order и name
 *     tags: [Departments]
 *     responses:
 *       200:
 *         description: Массив департаментов
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *                   description: { type: string, nullable: true }
 *                   sort_order: { type: integer }
 *                   created_at: { type: string }
 */
router.get('/', asyncHandler(async (req, res) => {
  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT id, name, description, sort_order, created_at
     FROM departments
     ORDER BY sort_order ASC, name ASC`
  )
  res.json(rows)
}))

/**
 * @swagger
 * /api/departments:
 *   post:
 *     summary: Создать департамент (только admin)
 *     tags: [Departments]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               sort_order: { type: integer }
 *     responses:
 *       201:
 *         description: Департамент создан
 *       403:
 *         description: Только администратор может создавать департаменты
 */
router.post('/', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const { name, description, sort_order } = req.body
  const db = await getDb()
  const sortOrder = sort_order != null ? Number(sort_order) : 0
  const result = await db.run(
    `INSERT INTO departments (name, description, sort_order, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [name || '', description || null, sortOrder]
  )
  const row = await db.get<any>('SELECT id, name, description, sort_order, created_at FROM departments WHERE id = ?', result.lastID)
  res.status(201).json(row)
}))

/**
 * @swagger
 * /api/departments/{id}:
 *   put:
 *     summary: Обновить департамент (только admin)
 *     tags: [Departments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               sort_order: { type: integer }
 *     responses:
 *       200:
 *         description: Департамент обновлён
 *       404:
 *         description: Департамент не найден
 */
router.put('/:id', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'Некорректный id департамента' })
    return
  }
  const { name, description, sort_order } = req.body
  const db = await getDb()
  const sortOrder = sort_order != null ? Number(sort_order) : 0
  await db.run(
    `UPDATE departments SET name = ?, description = ?, sort_order = ? WHERE id = ?`,
    [name ?? '', description ?? null, sortOrder, id]
  )
  const row = await db.get<any>('SELECT id, name, description, sort_order, created_at FROM departments WHERE id = ?', id)
  if (!row) {
    res.status(404).json({ message: 'Департамент не найден' })
    return
  }
  res.json(row)
}))

/**
 * @swagger
 * /api/departments/{id}:
 *   delete:
 *     summary: Удалить департамент (только admin)
 *     description: У пользователей этого департамента department_id станет NULL
 *     tags: [Departments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Департамент удалён
 *       404:
 *         description: Департамент не найден
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'Некорректный id департамента' })
    return
  }
  const db = await getDb()
  await db.run('UPDATE users SET department_id = NULL WHERE department_id = ?', id)
  const result = await db.run('DELETE FROM departments WHERE id = ?', id)
  if (result.changes === 0) {
    res.status(404).json({ message: 'Департамент не найден' })
    return
  }
  res.json({ message: 'Департамент удалён' })
}))

export default router
