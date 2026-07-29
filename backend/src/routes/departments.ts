import { Router } from 'express'
import { asyncHandler, AuthenticatedRequest } from '../middleware'
import { getDb } from '../config/database'

const router = Router()

/** Полный SELECT для admin write-путей (после миграций колонки есть). GET '/' — динамический. */
const DEPT_SELECT = `id, name, description, sort_order, created_at, code, address, is_pickup_point, is_active`

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

function normalizeCode(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const code = String(raw).trim()
  return code || null
}

router.get('/', asyncHandler(async (_req, res) => {
  const db = await getDb()
  try {
    const colsRaw = await db.all<{ name: string }>(`PRAGMA table_info(departments)`)
    const colNames = new Set((Array.isArray(colsRaw) ? colsRaw : []).map((c) => c.name))
    if (colNames.size === 0) {
      res.json([])
      return
    }
    const wanted = [
      'id',
      'name',
      'description',
      'sort_order',
      'created_at',
      'code',
      'address',
      'is_pickup_point',
      'is_active',
    ]
    const selectList = wanted.filter((c) => colNames.has(c)).join(', ')
    const rows = await db.all<any>(
      `SELECT ${selectList}
       FROM departments
       ORDER BY ${colNames.has('sort_order') ? 'sort_order ASC, ' : ''}name ASC`
    )
    res.json(rows)
  } catch {
    res.json([])
  }
}))

router.post('/', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const { name, description, sort_order, code, address, is_pickup_point, is_active } = req.body
  const db = await getDb()
  const sortOrder = sort_order != null ? Number(sort_order) : 0
  const codeNorm = normalizeCode(code)
  if (codeNorm) {
    const clash = await db.get<{ id: number }>(`SELECT id FROM departments WHERE code = ? LIMIT 1`, [codeNorm])
    if (clash) {
      res.status(400).json({ message: `Код точки «${codeNorm}» уже занят` })
      return
    }
  }
  const result = await db.run(
    `INSERT INTO departments (name, description, sort_order, code, address, is_pickup_point, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      name || '',
      description || null,
      sortOrder,
      codeNorm,
      address != null && String(address).trim() ? String(address).trim() : null,
      is_pickup_point ? 1 : 0,
      is_active === false || is_active === 0 ? 0 : 1,
    ]
  )
  const row = await db.get<any>(`SELECT ${DEPT_SELECT} FROM departments WHERE id = ?`, result.lastID)
  res.status(201).json(row)
}))

router.put('/:id', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'Некорректный id департамента' })
    return
  }
  const { name, description, sort_order, code, address, is_pickup_point, is_active } = req.body
  const db = await getDb()
  const existing = await db.get<any>(`SELECT ${DEPT_SELECT} FROM departments WHERE id = ?`, id)
  if (!existing) {
    res.status(404).json({ message: 'Департамент не найден' })
    return
  }
  const sortOrder = sort_order != null ? Number(sort_order) : existing.sort_order ?? 0
  const codeNorm = code !== undefined ? normalizeCode(code) : existing.code ?? null
  if (codeNorm) {
    const clash = await db.get<{ id: number }>(
      `SELECT id FROM departments WHERE code = ? AND id != ? LIMIT 1`,
      [codeNorm, id]
    )
    if (clash) {
      res.status(400).json({ message: `Код точки «${codeNorm}» уже занят` })
      return
    }
  }
  await db.run(
    `UPDATE departments
     SET name = ?, description = ?, sort_order = ?, code = ?, address = ?,
         is_pickup_point = ?, is_active = ?
     WHERE id = ?`,
    [
      name ?? existing.name,
      description !== undefined ? (description || null) : existing.description,
      sortOrder,
      codeNorm,
      address !== undefined
        ? (address != null && String(address).trim() ? String(address).trim() : null)
        : existing.address,
      is_pickup_point !== undefined ? (is_pickup_point ? 1 : 0) : existing.is_pickup_point ?? 0,
      is_active !== undefined
        ? (is_active === false || is_active === 0 ? 0 : 1)
        : existing.is_active ?? 1,
      id,
    ]
  )
  const row = await db.get<any>(`SELECT ${DEPT_SELECT} FROM departments WHERE id = ?`, id)
  res.json(row)
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'Некорректный id департамента' })
    return
  }
  const db = await getDb()
  await db.run('UPDATE users SET department_id = NULL WHERE department_id = ?', id)
  await db.run('UPDATE orders SET fulfillment_department_id = NULL WHERE fulfillment_department_id = ?', id).catch(() => {})
  const result = await db.run('DELETE FROM departments WHERE id = ?', id)
  if (result.changes === 0) {
    res.status(404).json({ message: 'Департамент не найден' })
    return
  }
  res.json({ message: 'Департамент удалён' })
}))

export default router
