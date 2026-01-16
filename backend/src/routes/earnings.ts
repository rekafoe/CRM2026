import { Router } from 'express'
import { asyncHandler, AuthenticatedRequest } from '../middleware'
import { getDb } from '../config/database'

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
  res.json({ month, total, items })
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
  res.json({ date, total, items })
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

  const db = await getDb()
  const users = await db.all<any>('SELECT id, name, role, is_active FROM users ORDER BY name')

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
  const shiftsMap = new Map<number, { hours: number; shifts: number }>();
  shifts.forEach((r: any) => {
    shiftsMap.set(Number(r.user_id), {
      hours: Number(r.hours) || 0,
      shifts: Number(r.shifts) || 0,
    });
  });

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
    const history = historyKeys.map((key) => ({
      month: key,
      total: historyMap.get(`${u.id}_${key}`) || 0,
    }))
    return {
      userId: u.id,
      name: u.name,
      role: u.role,
      isActive: !!u.is_active,
      totalCurrentMonth: totalsCurrentMap.get(u.id) || 0,
      totalPreviousMonth: totalsPrevMap.get(u.id) || 0,
      hours: shift.hours,
      shifts: shift.shifts,
      history,
    }
  })

  res.json({ month, previousMonth: prevMonth, historyMonths, users: result })
}))

export default router
