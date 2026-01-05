import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'
import { AuthenticatedRequest } from '../middleware'

const router = Router()

// GET /api/daily-reports — список отчётов
router.get('/', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  const { user_id, from, to, current_user_id } = req.query as any
  const params: any[] = []
  const where: string[] = []
  
  // Если указан конкретный пользователь, показываем только его отчёты (только для админа)
  if (user_id) {
    if (!authUser || authUser.role !== 'admin') { res.status(403).json({ message: 'Forbidden' }); return }
    where.push('dr.user_id = ?')
    params.push(Number(user_id))
  } else if (current_user_id) {
    // Если не указан user_id, но есть current_user_id, показываем отчёты текущего пользователя
    where.push('dr.user_id = ?')
    params.push(Number(current_user_id))
  } else if (authUser) {
    // По умолчанию — только свои
    where.push('dr.user_id = ?')
    params.push(authUser.id)
  }
  
  if (from) { where.push('dr.report_date >= ?'); params.push(String(from)) }
  if (to) { where.push('dr.report_date <= ?'); params.push(String(to)) }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const db = await getDb()
  const rows = (await db.all<any>(
    `SELECT dr.id, dr.report_date, dr.orders_count, dr.total_revenue, dr.created_at, dr.updated_at, dr.user_id, dr.cash_actual,
            u.name as user_name
       FROM daily_reports dr
       LEFT JOIN users u ON u.id = dr.user_id
       ${whereSql}
       ORDER BY dr.report_date DESC`,
    ...params
  )) as unknown as Array<any>
  res.json(rows)
}))

// GET /api/daily/:date — получить отчёт за дату
router.get('/:date', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  const qUserIdRaw = (req.query as any)?.user_id
  const targetUserId = qUserIdRaw != null && qUserIdRaw !== '' ? Number(qUserIdRaw) : authUser?.id
  if (!targetUserId) { res.status(400).json({ message: 'Не указан пользователь' }); return }

  // Access control: only admin can read others' reports
  if (qUserIdRaw != null && targetUserId !== authUser?.id && authUser?.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' }); return
  }

  const db = await getDb()
  const row = await db.get<any>(
    `SELECT dr.id, dr.report_date, dr.orders_count, dr.total_revenue, dr.created_at, dr.updated_at, dr.user_id, dr.snapshot_json, dr.cash_actual,
            u.name as user_name
       FROM daily_reports dr
       LEFT JOIN users u ON u.id = dr.user_id
      WHERE dr.report_date = ? AND dr.user_id = ?`,
    req.params.date,
    targetUserId
  )
  if (!row) {
    res.status(404).json({ message: 'Отчёт не найден' })
    return
  }
  res.json(row)
}))

// PATCH /api/daily/:date — обновить отчёт
router.patch('/:date', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  const { orders_count, total_revenue, user_id, cash_actual } = req.body as {
    orders_count?: number
    total_revenue?: number
    user_id?: number
    cash_actual?: number
  }
  
  console.log('PATCH /daily-reports/:date', {
    date: req.params.date,
    body: req.body,
    query: req.query,
    authUser: authUser?.id
  });
  if (orders_count == null && total_revenue == null && user_id == null && cash_actual == null) {
    res.status(400).json({ message: 'Нет данных для обновления' })
    return
  }

  // Determine target row by (date, user)
  const qUserIdRaw = (req.query as any)?.user_id
  const targetUserId = qUserIdRaw != null && qUserIdRaw !== '' ? Number(qUserIdRaw) : authUser?.id
  if (!targetUserId) { res.status(400).json({ message: 'Не указан пользователь' }); return }
  if (qUserIdRaw != null && targetUserId !== authUser?.id && authUser?.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' }); return
  }

  const db = await getDb()
  const existing = await db.get<any>(
    'SELECT id, user_id FROM daily_reports WHERE report_date = ? AND user_id = ?',
    req.params.date,
    targetUserId
  )
  if (!existing) {
    res.status(404).json({ message: 'Отчёт не найден' })
    return
  }

  // Allow changing owner only for admin
  const nextUserId = user_id != null && authUser?.role === 'admin' ? user_id : targetUserId

  try {
    // Строим SET часть запроса
    const setParts: string[] = []
    const values: any[] = []
    
    if (orders_count != null) {
      setParts.push('orders_count = ?')
      values.push(orders_count)
    }
    
    if (total_revenue != null) {
      setParts.push('total_revenue = ?')
      values.push(total_revenue)
    }
    
    if (cash_actual != null) {
      setParts.push('cash_actual = ?')
      values.push(Number(cash_actual))
    }
    
    if (nextUserId !== targetUserId) {
      setParts.push('user_id = ?')
      values.push(nextUserId)
    }
    
    setParts.push("updated_at = datetime('now')")
    
    const setClause = setParts.join(', ')
    
    await db.run(
      `UPDATE daily_reports SET ${setClause} WHERE report_date = ? AND user_id = ?`,
      ...values,
      req.params.date,
      targetUserId
    )
  } catch (e: any) {
    if (String(e?.message || '').includes('UNIQUE')) { res.status(409).json({ message: 'Отчёт для этого пользователя и даты уже существует' }); return }
    throw e
  }

  const updated = await db.get<any>(
    `SELECT dr.id, dr.report_date, dr.orders_count, dr.total_revenue, dr.created_at, dr.updated_at, dr.user_id, dr.snapshot_json, dr.cash_actual,
            u.name as user_name
       FROM daily_reports dr
       LEFT JOIN users u ON u.id = dr.user_id
      WHERE dr.report_date = ? AND dr.user_id = ?`,
    req.params.date,
    nextUserId
  )
  res.json(updated)
}))

// GET /api/daily-reports/full/:date — получить полный отчёт с заказами
router.get('/full/:date', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  const qUserIdRaw = (req.query as any)?.user_id
  const targetUserId = qUserIdRaw != null && qUserIdRaw !== '' ? Number(qUserIdRaw) : authUser?.id
  if (!targetUserId) { res.status(400).json({ message: 'Не указан пользователь' }); return }

  // Access control: only admin can read others' reports
  if (qUserIdRaw != null && targetUserId !== authUser?.id && authUser?.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' }); return
  }

  const db = await getDb()
  const row = await db.get<any>(
    `SELECT dr.id, dr.report_date, dr.orders_count, dr.total_revenue, dr.created_at, dr.updated_at, dr.user_id, dr.snapshot_json, dr.cash_actual,
            u.name as user_name
       FROM daily_reports dr
       LEFT JOIN users u ON u.id = dr.user_id
      WHERE dr.report_date = ? AND dr.user_id = ?`,
    req.params.date,
    targetUserId
  )
  if (!row) {
    res.status(404).json({ message: 'Отчёт не найден' })
    return
  }

  // Get orders for this date and user
  const orders = await db.all<any>(
    `SELECT o.id, o.number, o.status, o.createdAt, o.customerName, o.customerPhone, o.customerEmail, o.prepaymentAmount, o.prepaymentStatus, o.paymentUrl, o.paymentId, o.userId
     FROM orders o
     WHERE DATE(o.createdAt) = ? AND o.userId = ?
     ORDER BY o.id DESC`,
    req.params.date,
    targetUserId
  )

  // Get items for each order
  for (const order of orders) {
    const items = await db.all<any>(
      'SELECT id, orderId, type, params, price, quantity, printerId, sides, sheets, waste, clicks FROM items WHERE orderId = ?',
      order.id
    )
    order.items = items.map((item: any) => ({
      ...item,
      params: JSON.parse(item.params || '{}')
    }))
  }

  row.orders = orders
  res.json(row)
}))

// POST /api/daily-reports/full — сохранить полный отчёт
router.post('/full', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  const { report_date, user_id, orders_count, total_revenue, cash_actual, orders } = req.body as {
    report_date: string
    user_id?: number
    orders_count?: number
    total_revenue?: number
    cash_actual?: number
    orders?: any[]
  }
  
  if (!report_date) { res.status(400).json({ message: 'Нужна дата YYYY-MM-DD' }); return }
  
  const targetUserId = user_id != null ? Number(user_id) : authUser?.id
  if (!targetUserId) { res.status(400).json({ message: 'Не указан пользователь' }); return }
  
  if (targetUserId !== authUser?.id && authUser?.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' }); return
  }

  const db = await getDb()
  try {
    await db.run('BEGIN')
    
    // Update or create daily report
    await db.run(
      `INSERT OR REPLACE INTO daily_reports (report_date, orders_count, total_revenue, user_id, cash_actual, snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      report_date,
      orders_count || 0,
      total_revenue || 0,
      targetUserId,
      cash_actual != null ? Number(cash_actual) : null,
      orders ? JSON.stringify(orders) : null
    )
    
    await db.run('COMMIT')
    
    const updated = await db.get<any>(
      `SELECT dr.id, dr.report_date, dr.orders_count, dr.total_revenue, dr.created_at, dr.updated_at, dr.user_id, dr.cash_actual,
              u.name as user_name
         FROM daily_reports dr
         LEFT JOIN users u ON u.id = dr.user_id
        WHERE dr.report_date = ? AND dr.user_id = ?`,
      report_date,
      targetUserId
    )
    
    res.json(updated)
  } catch (e) {
    await db.run('ROLLBACK')
    throw e
  }
}))

// POST /api/daily — создать отчёт на дату
router.post('/', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  const { report_date, user_id, orders_count = 0, total_revenue = 0, cash_actual } = req.body as {
    report_date: string; user_id?: number; orders_count?: number; total_revenue?: number; cash_actual?: number
  }
  if (!report_date) { res.status(400).json({ message: 'Нужна дата YYYY-MM-DD' }); return }
  const today = new Date().toISOString().slice(0,10)
  if (report_date !== today) { res.status(400).json({ message: 'Создание отчёта возможно только за сегодняшнюю дату' }); return }
  const targetUserId = user_id != null ? Number(user_id) : authUser?.id
  if (!targetUserId) { res.status(400).json({ message: 'Не указан пользователь' }); return }
  if (!authUser || targetUserId !== authUser.id) { res.status(403).json({ message: 'Создание отчёта возможно только для текущего пользователя' }); return }
  const db = await getDb()
  try {
    await db.run(
      'INSERT INTO daily_reports (report_date, orders_count, total_revenue, user_id, cash_actual) VALUES (?, ?, ?, ?, ?)',
      report_date,
      orders_count,
      total_revenue,
      targetUserId,
      cash_actual != null ? Number(cash_actual) : null
    )
  } catch (e: any) {
    if (String(e?.message || '').includes('UNIQUE')) { res.status(409).json({ message: 'Отчёт уже существует' }); return }
    throw e
  }
  const row = await db.get<any>(
    `SELECT dr.id, dr.report_date, dr.orders_count, dr.total_revenue, dr.created_at, dr.updated_at, dr.user_id, dr.snapshot_json,
            u.name as user_name
       FROM daily_reports dr
       LEFT JOIN users u ON u.id = dr.user_id
      WHERE dr.report_date = ? AND dr.user_id = ?`,
    report_date,
    targetUserId
  )
  res.status(201).json(row)
}))

// DELETE /api/daily-reports/:id — удалить отчёт
router.delete('/:id', asyncHandler(async (req, res) => {
  const reportId = Number(req.params.id)
  if (!reportId) {
    res.status(400).json({ message: 'Неверный ID отчёта' })
    return
  }

  const db = await getDb()
  // Проверяем, существует ли отчёт
  const report = await db.get('SELECT id FROM daily_reports WHERE id = ?', reportId)
  if (!report) {
    res.status(404).json({ message: 'Отчёт не найден' })
    return
  }

  await db.run('DELETE FROM daily_reports WHERE id = ?', reportId)
  res.json({ message: 'Отчёт успешно удалён' })
}))

export default router
