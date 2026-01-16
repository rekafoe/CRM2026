import { Router } from 'express'
import { asyncHandler, AuthenticatedRequest } from '../middleware'
import { getDb } from '../config/database'

const router = Router()

router.get('/', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }

  const { user_id, month, date } = req.query as any
  let targetUserId = authUser.id
  if (user_id !== undefined && user_id !== null && user_id !== '') {
    if (authUser.role !== 'admin') {
      res.status(403).json({ message: 'Forbidden' })
      return
    }
    targetUserId = Number(user_id)
  }

  const where: string[] = ['user_id = ?']
  const params: any[] = [targetUserId]
  if (date) {
    where.push('work_date = ?')
    params.push(String(date))
  } else if (month) {
    where.push('substr(work_date, 1, 7) = ?')
    params.push(String(month).slice(0, 7))
  }

  const db = await getDb()
  const rows = await db.all<any>(
    `
    SELECT id, user_id, work_date, hours, comment, created_by, created_at, updated_at
    FROM user_shifts
    WHERE ${where.join(' AND ')}
    ORDER BY work_date DESC
    `,
    params
  )
  res.json(rows)
}))

router.post('/', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }

  const { user_id, date, hours, comment } = req.body as {
    user_id?: number
    date?: string
    hours?: number
    comment?: string
  }

  let targetUserId = authUser.id
  if (user_id !== undefined && user_id !== null) {
    if (authUser.role !== 'admin') {
      res.status(403).json({ message: 'Forbidden' })
      return
    }
    targetUserId = Number(user_id)
  }

  const workDate = date ? String(date) : new Date().toISOString().slice(0, 10)
  const hoursValue = Number(hours)
  if (!Number.isFinite(hoursValue) || hoursValue < 0) {
    res.status(400).json({ message: 'Некорректное количество часов' })
    return
  }

  const db = await getDb()
  await db.run(
    `
    INSERT INTO user_shifts (user_id, work_date, hours, comment, created_by, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, work_date) DO UPDATE SET
      hours = excluded.hours,
      comment = excluded.comment,
      updated_at = datetime('now')
    `,
    [targetUserId, workDate, hoursValue, comment ?? null, authUser.id]
  )

  const row = await db.get<any>(
    `
    SELECT id, user_id, work_date, hours, comment, created_by, created_at, updated_at
    FROM user_shifts
    WHERE user_id = ? AND work_date = ?
    `,
    [targetUserId, workDate]
  )
  res.json(row)
}))

router.put('/:id', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser || authUser.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  const { id } = req.params
  const { hours, comment, date } = req.body as { hours?: number; comment?: string; date?: string }
  const updates: string[] = []
  const values: any[] = []
  if (hours !== undefined) {
    const hoursValue = Number(hours)
    if (!Number.isFinite(hoursValue) || hoursValue < 0) {
      res.status(400).json({ message: 'Некорректное количество часов' })
      return
    }
    updates.push('hours = ?')
    values.push(hoursValue)
  }
  if (comment !== undefined) {
    updates.push('comment = ?')
    values.push(comment)
  }
  if (date) {
    updates.push('work_date = ?')
    values.push(String(date))
  }

  if (updates.length === 0) {
    res.status(400).json({ message: 'Нет данных для обновления' })
    return
  }

  const db = await getDb()
  await db.run(
    `
    UPDATE user_shifts
    SET ${updates.join(', ')}, updated_at = datetime('now')
    WHERE id = ?
    `,
    [...values, Number(id)]
  )
  const row = await db.get<any>(
    `
    SELECT id, user_id, work_date, hours, comment, created_by, created_at, updated_at
    FROM user_shifts
    WHERE id = ?
    `,
    [Number(id)]
  )
  res.json(row)
}))

export default router
