import { Router } from 'express'
import { asyncHandler, AuthenticatedRequest } from '../middleware'
import { getDb } from '../config/database'
import { EarningsService } from '../services/earningsService'

const router = Router()

const getMonthKey = (input?: string) => {
  if (!input) return new Date().toISOString().slice(0, 7)
  return input.slice(0, 7)
}

const getPreviousMonthKey = (monthKey: string) => {
  const [yearStr, monthStr] = monthKey.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const date = new Date(year, month - 1, 1)
  date.setMonth(date.getMonth() - 1)
  return date.toISOString().slice(0, 7)
}

const buildMonthKeys = (count: number, baseMonth: string) => {
  const [yearStr, monthStr] = baseMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const result: string[] = []
  for (let i = 0; i < count; i += 1) {
    const d = new Date(year, month - 1, 1)
    d.setMonth(d.getMonth() - i)
    result.push(d.toISOString().slice(0, 7))
  }
  return result
}

router.get('/me', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
  const month = getMonthKey((req.query as any)?.month)
  const db = await getDb()
  const rows = await db.all<any>(
    `
    SELECT
      e.order_id,
      e.order_item_id,
      e.order_item_total,
      e.percent,
      e.amount,
      e.earned_date,
      i.type,
      i.params,
      o.number as order_number
    FROM order_item_earnings e
    JOIN items i ON i.id = e.order_item_id
    JOIN orders o ON o.id = e.order_id
    WHERE e.user_id = ? AND substr(e.earned_date, 1, 7) = ?
    ORDER BY e.earned_date DESC, e.order_item_id DESC
    `,
    [authUser.id, month]
  )

  const items = rows.map((row: any) => {
    let params: any = {}
    try {
      params = typeof row.params === 'string' ? JSON.parse(row.params) : row.params
    } catch {
      params = {}
    }
    return {
      id: row.id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      itemId: row.order_item_id,
      itemType: row.type,
      itemName: params?.productName || params?.description || row.type,
      itemTotal: row.order_item_total,
      percent: row.percent,
      amount: row.amount,
      earnedDate: row.earned_date,
    }
  })

  const total = items.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)

  const penaltyRows = await db.all<any>(
    `SELECT id, amount, reason, penalty_date, order_id, created_at
     FROM user_penalties
     WHERE user_id = ? AND substr(penalty_date, 1, 7) = ?
     ORDER BY penalty_date DESC, id DESC`,
    [authUser.id, month]
  ).catch(() => [])
  const penalties = (penaltyRows || []).map((p: any) => ({
    id: p.id,
    amount: Number(p.amount) || 0,
    reason: p.reason || '',
    penaltyDate: p.penalty_date,
    orderId: p.order_id ?? undefined,
    createdAt: p.created_at,
  }))
  const totalPenalties = penalties.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)

  const bonusRows = await db.all<any>(
    `SELECT id, amount, reason, bonus_date, order_id, created_at
     FROM user_bonuses
     WHERE user_id = ? AND substr(bonus_date, 1, 7) = ?
     ORDER BY bonus_date DESC, id DESC`,
    [authUser.id, month]
  ).catch(() => [])
  const bonuses = (bonusRows || []).map((b: any) => ({
    id: b.id,
    amount: Number(b.amount) || 0,
    reason: b.reason || '',
    bonusDate: b.bonus_date,
    orderId: b.order_id ?? undefined,
    createdAt: b.created_at,
  }))
  const totalBonuses = bonuses.reduce((s: number, b: any) => s + (Number(b.amount) || 0), 0)
  const totalNet = Math.max(0, total + totalBonuses - totalPenalties)

  res.json({ month, total, totalPenalties, totalBonuses, totalNet, penalties, bonuses, items })
}))

router.get('/daily', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
  const { date, user_id } = req.query as any
  if (!date) {
    res.status(400).json({ message: 'date is required' })
    return
  }
  const requestedUserId = user_id ? Number(user_id) : authUser.id
  if (requestedUserId !== authUser.id && authUser.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  const db = await getDb()
  const rows = await db.all<any>(
    `
    SELECT
      e.order_id,
      e.order_item_id,
      e.order_item_total,
      e.percent,
      e.amount,
      e.earned_date,
      i.type,
      i.params,
      o.number as order_number
    FROM order_item_earnings e
    JOIN items i ON i.id = e.order_item_id
    JOIN orders o ON o.id = e.order_id
    WHERE e.user_id = ? AND e.earned_date = ?
    ORDER BY e.order_item_id DESC
    `,
    [requestedUserId, String(date)]
  )

  const items = rows.map((row: any) => {
    let params: any = {}
    try {
      params = typeof row.params === 'string' ? JSON.parse(row.params) : row.params
    } catch {
      params = {}
    }
    return {
      orderId: row.order_id,
      orderNumber: row.order_number,
      itemId: row.order_item_id,
      itemType: row.type,
      itemName: params?.productName || params?.description || row.type,
      itemTotal: row.order_item_total,
      percent: row.percent,
      amount: row.amount,
      earnedDate: row.earned_date,
    }
  })

  const total = items.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)

  const penaltyRows = await db.all<any>(
    `SELECT id, amount FROM user_penalties WHERE user_id = ? AND penalty_date = ?`,
    [requestedUserId, String(date)]
  ).catch(() => [])
  const totalPenalties = (penaltyRows || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
  const bonusRows = await db.all<any>(
    `SELECT amount FROM user_bonuses WHERE user_id = ? AND bonus_date = ?`,
    [requestedUserId, String(date)]
  ).catch(() => [])
  const totalBonuses = (bonusRows || []).reduce((s: number, b: any) => s + (Number(b.amount) || 0), 0)
  const totalNet = Math.max(0, total + totalBonuses - totalPenalties)

  res.json({ date, total, totalPenalties, totalBonuses, totalNet, items })
}))

router.get('/admin', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser || authUser.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  const month = getMonthKey((req.query as any)?.month)
  const historyMonths = Math.max(1, Math.min(6, Number((req.query as any)?.history_months) || 3))
  const prevMonth = getPreviousMonthKey(month)
  const departmentId = (req.query as any)?.department_id != null ? parseInt(String((req.query as any).department_id), 10) : undefined

  const db = await getDb()
  let users = await db.all<any>('SELECT id, name, role, is_active, department_id FROM users ORDER BY name')
  if (Number.isFinite(departmentId)) {
    users = users.filter((u: any) => u.department_id === departmentId)
  }

  const totalsCurrent = await db.all<any>(
    `
    SELECT user_id, SUM(amount) as total
    FROM order_item_earnings
    WHERE substr(earned_date, 1, 7) = ?
    GROUP BY user_id
    `,
    [month]
  )
  const totalsPrev = await db.all<any>(
    `
    SELECT user_id, SUM(amount) as total
    FROM order_item_earnings
    WHERE substr(earned_date, 1, 7) = ?
    GROUP BY user_id
    `,
    [prevMonth]
  )
  const shifts = await db.all<any>(
    `
    SELECT user_id, SUM(hours) as hours, COUNT(*) as shifts
    FROM user_shifts
    WHERE substr(work_date, 1, 7) = ?
    GROUP BY user_id
    `,
    [month]
  )

  const totalsCurrentMap = new Map(totalsCurrent.map((r: any) => [Number(r.user_id), Number(r.total) || 0]))
  const totalsPrevMap = new Map(totalsPrev.map((r: any) => [Number(r.user_id), Number(r.total) || 0]))
  const shiftsMap = new Map<number, { hours: number; shifts: number }>()
  shifts.forEach((r: any) => {
    shiftsMap.set(Number(r.user_id), {
      hours: Number(r.hours) || 0,
      shifts: Number(r.shifts) || 0,
    })
  })

  const penaltiesRows = await db.all<any>(
    `SELECT user_id, SUM(amount) as total FROM user_penalties
     WHERE substr(penalty_date, 1, 7) = ?
     GROUP BY user_id`,
    [month]
  ).catch(() => [])
  const penaltiesMap = new Map(penaltiesRows.map((r: any) => [Number(r.user_id), Number(r.total) || 0]))
  const bonusesRows = await db.all<any>(
    `SELECT user_id, SUM(amount) as total FROM user_bonuses
     WHERE substr(bonus_date, 1, 7) = ?
     GROUP BY user_id`,
    [month]
  ).catch(() => [])
  const bonusesMap = new Map(bonusesRows.map((r: any) => [Number(r.user_id), Number(r.total) || 0]))

  const historyKeys = buildMonthKeys(historyMonths, month)
  const historyRows = await db.all<any>(
    `
    SELECT user_id, substr(earned_date, 1, 7) as month_key, SUM(amount) as total
    FROM order_item_earnings
    WHERE substr(earned_date, 1, 7) IN (${historyKeys.map(() => '?').join(',')})
    GROUP BY user_id, month_key
    `,
    historyKeys
  )
  const historyMap = new Map<string, number>()
  historyRows.forEach((row: any) => {
    historyMap.set(`${row.user_id}_${row.month_key}`, Number(row.total) || 0)
  })

  const result = users.map((u: any) => {
    const shift = shiftsMap.get(u.id) || { hours: 0, shifts: 0 }
    const earnings = totalsCurrentMap.get(u.id) || 0
    const totalPenalties = penaltiesMap.get(u.id) || 0
    const totalBonuses = bonusesMap.get(u.id) || 0
    const totalNet = Math.max(0, earnings + totalBonuses - totalPenalties)
    const history = historyKeys.map((key) => ({
      month: key,
      total: historyMap.get(`${u.id}_${key}`) || 0,
    }))
    return {
      userId: u.id,
      name: u.name,
      role: u.role,
      isActive: !!u.is_active,
      totalCurrentMonth: earnings,
      totalPreviousMonth: totalsPrevMap.get(u.id) || 0,
      totalPenalties,
      totalBonuses,
      totalNet,
      hours: shift.hours,
      shifts: shift.shifts,
      history,
    }
  })

  res.json({ month, previousMonth: prevMonth, historyMonths, users: result })
}))

// ——— Штрафы (admin или свой user_id) ———

/** GET /api/earnings/penalties?user_id=&month= — список штрафов по пользователю и месяцу */
router.get('/penalties', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
  const { user_id, month } = req.query as { user_id?: string; month?: string }
  const targetUserId = user_id ? parseInt(user_id, 10) : authUser.id
  if (targetUserId !== authUser.id && authUser.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  const monthKey = month ? month.slice(0, 7) : new Date().toISOString().slice(0, 7)
  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT id, user_id, amount, reason, penalty_date, order_id, created_at, created_by
     FROM user_penalties
     WHERE user_id = ? AND substr(penalty_date, 1, 7) = ?
     ORDER BY penalty_date DESC, id DESC`,
    [targetUserId, monthKey]
  )
  const list = (rows || []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    amount: Number(r.amount) || 0,
    reason: r.reason || '',
    penaltyDate: r.penalty_date,
    orderId: r.order_id ?? undefined,
    createdAt: r.created_at,
    createdBy: r.created_by ?? undefined,
  }))
  const totalPenalties = list.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
  res.json({ month: monthKey, userId: targetUserId, totalPenalties, penalties: list })
}))

/** POST /api/earnings/penalties — создать штраф (только admin) */
router.post('/penalties', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser || authUser.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  const { user_id, amount, reason, penalty_date, order_id } = req.body as {
    user_id: number
    amount: number
    reason?: string
    penalty_date?: string
    order_id?: number
  }
  if (!user_id || amount == null || Number(amount) < 0) {
    res.status(400).json({ message: 'user_id and amount (>= 0) required' })
    return
  }
  const penaltyDate = penalty_date && penalty_date.slice(0, 10) ? penalty_date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  const db = await getDb()
  const result = await db.run(
    `INSERT INTO user_penalties (user_id, amount, reason, penalty_date, order_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user_id, Number(amount), reason || null, penaltyDate, order_id ?? null, authUser.id]
  )
  const id = (result as any).lastID
  const row = await db.get<any>(
    `SELECT id, user_id, amount, reason, penalty_date, order_id, created_at, created_by FROM user_penalties WHERE id = ?`,
    [id]
  )
  res.status(201).json({
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount) || 0,
    reason: row.reason || '',
    penaltyDate: row.penalty_date,
    orderId: row.order_id ?? undefined,
    createdAt: row.created_at,
    createdBy: row.created_by ?? undefined,
  })
}))

/** PATCH /api/earnings/penalties/:id — изменить штраф (только admin) */
router.patch('/penalties/:id', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser || authUser.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  const id = parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: 'Invalid id' })
    return
  }
  const { amount, reason, penalty_date } = req.body as { amount?: number; reason?: string; penalty_date?: string }
  const db = await getDb()
  const existing = await db.get<any>('SELECT id FROM user_penalties WHERE id = ?', [id])
  if (!existing) {
    res.status(404).json({ message: 'Penalty not found' })
    return
  }
  const updates: string[] = []
  const values: any[] = []
  if (amount != null) {
    updates.push('amount = ?')
    values.push(Number(amount))
  }
  if (reason !== undefined) {
    updates.push('reason = ?')
    values.push(reason || null)
  }
  if (penalty_date !== undefined) {
    updates.push('penalty_date = ?')
    values.push(penalty_date.slice(0, 10))
  }
  if (updates.length === 0) {
    const row = await db.get<any>(
      `SELECT id, user_id, amount, reason, penalty_date, order_id, created_at, created_by FROM user_penalties WHERE id = ?`,
      [id]
    )
    return res.json({
      id: row.id,
      userId: row.user_id,
      amount: Number(row.amount) || 0,
      reason: row.reason || '',
      penaltyDate: row.penalty_date,
      orderId: row.order_id ?? undefined,
      createdAt: row.created_at,
      createdBy: row.created_by ?? undefined,
    })
  }
  values.push(id)
  await db.run(`UPDATE user_penalties SET ${updates.join(', ')} WHERE id = ?`, values)
  const row = await db.get<any>(
    `SELECT id, user_id, amount, reason, penalty_date, order_id, created_at, created_by FROM user_penalties WHERE id = ?`,
    [id]
  )
  res.json({
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount) || 0,
    reason: row.reason || '',
    penaltyDate: row.penalty_date,
    orderId: row.order_id ?? undefined,
    createdAt: row.created_at,
    createdBy: row.created_by ?? undefined,
  })
}))

/** DELETE /api/earnings/penalties/:id — удалить штраф (только admin) */
router.delete('/penalties/:id', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser || authUser.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  const id = parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: 'Invalid id' })
    return
  }
  const db = await getDb()
  const result = await db.run('DELETE FROM user_penalties WHERE id = ?', [id])
  if ((result as any).changes === 0) {
    res.status(404).json({ message: 'Penalty not found' })
    return
  }
  res.status(204).send()
}))

// ——— Премии (admin или свой user_id) ———

/** GET /api/earnings/bonuses?user_id=&month= — список премий по пользователю и месяцу */
router.get('/bonuses', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
  const { user_id, month } = req.query as { user_id?: string; month?: string }
  const targetUserId = user_id ? parseInt(user_id, 10) : authUser.id
  if (targetUserId !== authUser.id && authUser.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  const monthKey = month ? month.slice(0, 7) : new Date().toISOString().slice(0, 7)
  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT id, user_id, amount, reason, bonus_date, order_id, created_at, created_by
     FROM user_bonuses
     WHERE user_id = ? AND substr(bonus_date, 1, 7) = ?
     ORDER BY bonus_date DESC, id DESC`,
    [targetUserId, monthKey]
  )
  const list = (rows || []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    amount: Number(r.amount) || 0,
    reason: r.reason || '',
    bonusDate: r.bonus_date,
    orderId: r.order_id ?? undefined,
    createdAt: r.created_at,
    createdBy: r.created_by ?? undefined,
  }))
  const totalBonuses = list.reduce((s: number, b: any) => s + (Number(b.amount) || 0), 0)
  res.json({ month: monthKey, userId: targetUserId, totalBonuses, bonuses: list })
}))

/** POST /api/earnings/bonuses — создать премию (только admin) */
router.post('/bonuses', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser || authUser.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  const { user_id, amount, reason, bonus_date, order_id } = req.body as {
    user_id: number
    amount: number
    reason?: string
    bonus_date?: string
    order_id?: number
  }
  if (!user_id || amount == null || Number(amount) < 0) {
    res.status(400).json({ message: 'user_id and amount (>= 0) required' })
    return
  }
  const bonusDate = bonus_date && bonus_date.slice(0, 10) ? bonus_date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  const db = await getDb()
  const result = await db.run(
    `INSERT INTO user_bonuses (user_id, amount, reason, bonus_date, order_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user_id, Number(amount), reason || null, bonusDate, order_id ?? null, authUser.id]
  )
  const id = (result as any).lastID
  const row = await db.get<any>(
    `SELECT id, user_id, amount, reason, bonus_date, order_id, created_at, created_by FROM user_bonuses WHERE id = ?`,
    [id]
  )
  res.status(201).json({
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount) || 0,
    reason: row.reason || '',
    bonusDate: row.bonus_date,
    orderId: row.order_id ?? undefined,
    createdAt: row.created_at,
    createdBy: row.created_by ?? undefined,
  })
}))

/** PATCH /api/earnings/bonuses/:id — изменить премию (только admin) */
router.patch('/bonuses/:id', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser || authUser.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  const id = parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: 'Invalid id' })
    return
  }
  const { amount, reason, bonus_date } = req.body as { amount?: number; reason?: string; bonus_date?: string }
  const db = await getDb()
  const existing = await db.get<any>('SELECT id FROM user_bonuses WHERE id = ?', [id])
  if (!existing) {
    res.status(404).json({ message: 'Bonus not found' })
    return
  }
  const updates: string[] = []
  const values: any[] = []
  if (amount != null) {
    updates.push('amount = ?')
    values.push(Number(amount))
  }
  if (reason !== undefined) {
    updates.push('reason = ?')
    values.push(reason || null)
  }
  if (bonus_date !== undefined) {
    updates.push('bonus_date = ?')
    values.push(bonus_date.slice(0, 10))
  }
  if (updates.length === 0) {
    const row = await db.get<any>(
      `SELECT id, user_id, amount, reason, bonus_date, order_id, created_at, created_by FROM user_bonuses WHERE id = ?`,
      [id]
    )
    return res.json({
      id: row.id,
      userId: row.user_id,
      amount: Number(row.amount) || 0,
      reason: row.reason || '',
      bonusDate: row.bonus_date,
      orderId: row.order_id ?? undefined,
      createdAt: row.created_at,
      createdBy: row.created_by ?? undefined,
    })
  }
  values.push(id)
  await db.run(`UPDATE user_bonuses SET ${updates.join(', ')} WHERE id = ?`, values)
  const row = await db.get<any>(
    `SELECT id, user_id, amount, reason, bonus_date, order_id, created_at, created_by FROM user_bonuses WHERE id = ?`,
    [id]
  )
  res.json({
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount) || 0,
    reason: row.reason || '',
    bonusDate: row.bonus_date,
    orderId: row.order_id ?? undefined,
    createdAt: row.created_at,
    createdBy: row.created_by ?? undefined,
  })
}))

/** DELETE /api/earnings/bonuses/:id — удалить премию (только admin) */
router.delete('/bonuses/:id', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user
  if (!authUser || authUser.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  const id = parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: 'Invalid id' })
    return
  }
  const db = await getDb()
  const result = await db.run('DELETE FROM user_bonuses WHERE id = ?', [id])
  if ((result as any).changes === 0) {
    res.status(404).json({ message: 'Bonus not found' })
    return
  }
  res.status(204).send()
}))

/**
 * POST/GET /api/earnings/recalculate — пересчёт ЗП по всем датам заказов.
 * Доступ: admin ИЛИ ?secret=RECALC_EARNINGS_SECRET (если задана в env).
 * Параметры: from, to (YYYY-MM-DD) — ограничить диапазон дат.
 */
router.all('/recalculate', asyncHandler(async (req, res) => {
  const secret = process.env.RECALC_EARNINGS_SECRET
  const authHeader = req.headers['authorization'] || ''
  const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined
  const providedSecret = (req.query as any)?.secret || req.headers['x-recalculation-secret'] || bearerToken

  const isAuthorizedBySecret = !!secret && !!providedSecret && secret === providedSecret
  const authUser = (req as AuthenticatedRequest).user
  const isAdmin = authUser && (authUser as { role?: string }).role === 'admin'

  if (!isAuthorizedBySecret && !isAdmin) {
    res.status(403).json({ message: 'Forbidden: требуется admin или secret' })
    return
  }

  const from = (req.query as any)?.from
  const to = (req.query as any)?.to

  const db = await getDb()
  const rows = (await db.all(
    `SELECT DISTINCT substr(COALESCE(createdAt, created_at), 1, 10) as d
     FROM orders
     WHERE COALESCE(createdAt, created_at) IS NOT NULL
       AND substr(COALESCE(createdAt, created_at), 1, 10) != ''
     ORDER BY d`
  )) as Array<{ d: string }>

  let dates = (rows || []).map((r) => r.d).filter(Boolean)
  if (from) dates = dates.filter((d) => d >= from)
  if (to) dates = dates.filter((d) => d <= to)

  const start = Date.now()
  let errors = 0

  for (const date of dates) {
    try {
      await EarningsService.recalculateForDate(date)
    } catch (err) {
      errors++
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  res.json({
    ok: errors === 0,
    datesProcessed: dates.length,
    errors,
    elapsedSeconds: parseFloat(elapsed),
  })
}))

export default router
