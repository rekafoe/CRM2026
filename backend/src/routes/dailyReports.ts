import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'
import { AuthenticatedRequest } from '../middleware'
import { hasColumn } from '../utils/tableSchemaCache'

const router = Router()

// GET /api/daily-reports — список отчётов
router.get('/', asyncHandler(async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  const { user_id, from, to, current_user_id, show_all, scope } = req.query as any
  const params: any[] = []
  const where: string[] = []
  const isGlobal = scope === 'global'
  const isShowAll = show_all === '1' || show_all === 'true'
  
  // Если указан конкретный пользователь, показываем только его отчёты (только для админа)
  if (isGlobal) {
    where.push('dr.user_id IS NULL')
  } else if (user_id) {
    if (!authUser || authUser.role !== 'admin') { res.status(403).json({ message: 'Forbidden' }); return }
    where.push('dr.user_id = ?')
    params.push(Number(user_id))
  } else if (isShowAll) {
    // Разрешаем всем авторизованным пользователям видеть вклады в кассу
    if (!authUser) { res.status(401).json({ message: 'Unauthorized' }); return }
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
  const isGlobal = (req.query as any)?.scope === 'global'
  const targetUserId = qUserIdRaw != null && qUserIdRaw !== '' ? Number(qUserIdRaw) : authUser?.id
  if (!isGlobal && !targetUserId) { res.status(400).json({ message: 'Не указан пользователь' }); return }

  // Access control: only admin can read others' reports
  if (!isGlobal && qUserIdRaw != null && targetUserId !== authUser?.id && authUser?.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' }); return
  }

  const db = await getDb()
  const row = isGlobal
    ? await db.get<any>(
        `SELECT dr.id, dr.report_date, dr.orders_count, dr.total_revenue, dr.created_at, dr.updated_at, dr.user_id, dr.snapshot_json, dr.cash_actual,
                u.name as user_name
           FROM daily_reports dr
           LEFT JOIN users u ON u.id = dr.user_id
          WHERE dr.report_date = ? AND dr.user_id IS NULL`,
        req.params.date
      )
    : await db.get<any>(
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
  let debtClosedIssuedByMe = 0
  if (!isGlobal && targetUserId) {
    try {
      const hasIssuedBy = await hasColumn('debt_closed_events', 'issued_by_user_id')
      if (hasIssuedBy) {
        const d = String(req.params.date || '').slice(0, 10)
        const r = await db.get<{ s: number }>(
          'SELECT COALESCE(SUM(amount), 0) AS s FROM debt_closed_events WHERE closed_date = ? AND issued_by_user_id = ?',
          d,
          targetUserId
        )
        debtClosedIssuedByMe = Number(r?.s ?? 0)
      }
    } catch {
      /* ignore */
    }
  }
  res.json({ ...row, debt_closed_issued_by_me: debtClosedIssuedByMe })
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
  const isGlobal = (req.query as any)?.scope === 'global'
  const targetUserId = qUserIdRaw != null && qUserIdRaw !== '' ? Number(qUserIdRaw) : authUser?.id
  if (!isGlobal && !targetUserId) { res.status(400).json({ message: 'Не указан пользователь' }); return }
  if (!isGlobal && qUserIdRaw != null && targetUserId !== authUser?.id && authUser?.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' }); return
  }

  const db = await getDb()
  const existing = isGlobal
    ? await db.get<any>(
        'SELECT id, user_id FROM daily_reports WHERE report_date = ? AND user_id IS NULL',
        req.params.date
      )
    : await db.get<any>(
        'SELECT id, user_id FROM daily_reports WHERE report_date = ? AND user_id = ?',
        req.params.date,
        targetUserId
      )
  
  // Allow changing owner only for admin
  const nextUserId = !isGlobal && user_id != null && authUser?.role === 'admin' ? user_id : targetUserId

  // Если отчёт не найден, создаём его автоматически
  if (!existing) {
    // Определяем значения для создания отчёта
    const newOrdersCount = orders_count != null ? orders_count : 0
    const newTotalRevenue = total_revenue != null ? total_revenue : 0
    const newCashActual = cash_actual != null ? Number(cash_actual) : null
    
    if (isGlobal) {
      // Создаём глобальный отчёт (user_id = NULL)
      await db.run(
        `INSERT INTO daily_reports (report_date, orders_count, total_revenue, user_id, cash_actual, updated_at)
         VALUES (?, ?, ?, NULL, ?, datetime('now'))`,
        req.params.date,
        newOrdersCount,
        newTotalRevenue,
        newCashActual
      )
    } else {
      // Создаём отчёт для пользователя
      await db.run(
        `INSERT INTO daily_reports (report_date, orders_count, total_revenue, user_id, cash_actual, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        req.params.date,
        newOrdersCount,
        newTotalRevenue,
        nextUserId,
        newCashActual
      )
    }
  } else {
    // Отчёт существует, обновляем его
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
      
      // Обновляем только если есть что обновлять
      if (setParts.length > 0) {
        setParts.push("updated_at = datetime('now')")
        const setClause = setParts.join(', ')
        
        if (isGlobal) {
          await db.run(
            `UPDATE daily_reports SET ${setClause} WHERE report_date = ? AND user_id IS NULL`,
            ...values,
            req.params.date
          )
        } else {
          await db.run(
            `UPDATE daily_reports SET ${setClause} WHERE report_date = ? AND user_id = ?`,
            ...values,
            req.params.date,
            targetUserId
          )
        }
      }
    } catch (e: any) {
      if (String(e?.message || '').includes('UNIQUE')) { res.status(409).json({ message: 'Отчёт для этого пользователя и даты уже существует' }); return }
      throw e
    }
  }

  const updated = isGlobal
    ? await db.get<any>(
        `SELECT dr.id, dr.report_date, dr.orders_count, dr.total_revenue, dr.created_at, dr.updated_at, dr.user_id, dr.snapshot_json, dr.cash_actual,
                u.name as user_name
           FROM daily_reports dr
           LEFT JOIN users u ON u.id = dr.user_id
          WHERE dr.report_date = ? AND dr.user_id IS NULL`,
        req.params.date
      )
    : await db.get<any>(
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
  const isGlobal = (req.query as any)?.scope === 'global'
  const targetUserId = qUserIdRaw != null && qUserIdRaw !== '' ? Number(qUserIdRaw) : authUser?.id
  if (!isGlobal && !targetUserId) { res.status(400).json({ message: 'Не указан пользователь' }); return }

  // Access control: only admin can read others' reports
  if (!isGlobal && qUserIdRaw != null && targetUserId !== authUser?.id && authUser?.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' }); return
  }

  const db = await getDb()
  const row = isGlobal
    ? await db.get<any>(
        `SELECT dr.id, dr.report_date, dr.orders_count, dr.total_revenue, dr.created_at, dr.updated_at, dr.user_id, dr.snapshot_json, dr.cash_actual,
                u.name as user_name
           FROM daily_reports dr
           LEFT JOIN users u ON u.id = dr.user_id
          WHERE dr.report_date = ? AND dr.user_id IS NULL`,
        req.params.date
      )
    : await db.get<any>(
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

  // Заказы за дату: созданные в этот день ИЛИ выданные в этот день (владелец). Чтобы заказ не пропадал из отчёта создателя при выдаче коллегой.
  const d = String(req.params.date || '').slice(0, 10)
  const orders = isGlobal
    ? await db.all<any>(
        `SELECT o.id, o.number, o.status, o.createdAt, o.customerName, o.customerPhone, o.customerEmail, o.prepaymentAmount, o.prepaymentStatus, o.paymentUrl, o.paymentId, o.userId
         FROM orders o
         WHERE substr(COALESCE(o.created_at, o.createdAt), 1, 10) = ?
            OR (o.status = 4 AND substr(COALESCE(o.updated_at, o.created_at, o.createdAt), 1, 10) = ?)
         ORDER BY o.id DESC`,
        d,
        d
      )
    : await db.all<any>(
        `SELECT o.id, o.number, o.status, o.createdAt, o.customerName, o.customerPhone, o.customerEmail, o.prepaymentAmount, o.prepaymentStatus, o.paymentUrl, o.paymentId, o.userId
         FROM orders o
         WHERE (substr(COALESCE(o.created_at, o.createdAt), 1, 10) = ? AND o.userId = ?)
            OR (o.status = 4 AND o.userId = ? AND substr(COALESCE(o.updated_at, o.created_at, o.createdAt), 1, 10) = ?)
         ORDER BY o.id DESC`,
        d,
        targetUserId,
        targetUserId,
        d
      )

  const seen = new Set<number>()
  const uniqueOrders = orders.filter((o: any) => {
    if (seen.has(o.id)) return false
    seen.add(o.id)
    return true
  })

  for (const order of uniqueOrders) {
    const items = await db.all<any>(
      'SELECT id, orderId, type, params, price, quantity, printerId, sides, sheets, waste, clicks FROM items WHERE orderId = ?',
      order.id
    )
    order.items = items.map((item: any) => ({
      ...item,
      params: JSON.parse(item.params || '{}')
    }))
  }

  row.orders = uniqueOrders
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
  const isGlobal = (req.query as any)?.scope === 'global'
  
  if (!report_date) { res.status(400).json({ message: 'Нужна дата YYYY-MM-DD' }); return }
  
  const targetUserId = user_id != null ? Number(user_id) : authUser?.id
  if (!isGlobal && !targetUserId) { res.status(400).json({ message: 'Не указан пользователь' }); return }
  
  if (!isGlobal && targetUserId !== authUser?.id && authUser?.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' }); return
  }

  const db = await getDb()
  try {
    await db.run('BEGIN')
    
    if (isGlobal) {
      const existing = await db.get<any>(
        'SELECT id FROM daily_reports WHERE report_date = ? AND user_id IS NULL',
        report_date
      )
      if (existing) {
        await db.run(
          `UPDATE daily_reports
             SET orders_count = ?, total_revenue = ?, cash_actual = ?, snapshot_json = ?, updated_at = datetime('now')
           WHERE report_date = ? AND user_id IS NULL`,
          orders_count || 0,
          total_revenue || 0,
          cash_actual != null ? Number(cash_actual) : null,
          orders ? JSON.stringify(orders) : null,
          report_date
        )
      } else {
        await db.run(
          `INSERT INTO daily_reports (report_date, orders_count, total_revenue, user_id, cash_actual, snapshot_json)
           VALUES (?, ?, ?, NULL, ?, ?)`,
          report_date,
          orders_count || 0,
          total_revenue || 0,
          cash_actual != null ? Number(cash_actual) : null,
          orders ? JSON.stringify(orders) : null
        )
      }
    } else {
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
    }
    
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
