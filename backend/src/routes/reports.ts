import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'

const router = Router()

const DEFAULT_REASON_PRESETS: Record<string, string[]> = {
  delete: [
    'Ошибочный заказ',
    'Дубликат заказа',
    'Клиент отказался',
    'Невозможно выполнить заказ',
    'Техническая ошибка',
  ],
  status_cancel: [
    'Клиент отменил заказ',
    'Не подтверждена предоплата',
    'Нет материалов в наличии',
    'Нарушены сроки выполнения',
    'Ошибочное оформление заказа',
  ],
  online_cancel: [
    'Клиент не вышел на связь',
    'Клиент отказался от заказа',
    'Не подтверждена предоплата',
    'Обнаружена ошибка в заказе',
    'Дубликат онлайн-заказа',
  ],
}

async function ensureReasonPresetsSettingsTable(db: any): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS reason_presets_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT NOT NULL UNIQUE,
      presets_json TEXT NOT NULL,
      updated_by INTEGER,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

function normalizePresets(input: unknown, fallback: string[]): string[] {
  const arr = Array.isArray(input) ? input : fallback
  const normalized = arr
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .map((v) => v.slice(0, 120))
  return Array.from(new Set(normalized))
}

/** Парсит period (дни) или date_from/date_to в диапазон для аналитики */
function getAnalyticsDateRange(query: Record<string, unknown>): {
  startDate: Date
  endDate: Date | null
  dateParams: string[]
  dateFilter: (alias: string) => string
} {
  const dateFrom = query.date_from ? String(query.date_from).trim().slice(0, 10) : null
  const dateTo = query.date_to ? String(query.date_to).trim().slice(0, 10) : null
  if (dateFrom && dateTo) {
    const startDate = new Date(dateFrom + 'T00:00:00.000Z')
    const endDate = new Date(dateTo + 'T23:59:59.999Z')
    return {
      startDate,
      endDate,
      dateParams: [startDate.toISOString(), endDate.toISOString()],
      dateFilter: (alias: string) => {
        const p = alias ? `${alias}.createdAt` : 'createdAt'
        return `${p} >= ? AND ${p} <= ?`
      }
    }
  }
  const days = parseInt(String(query.period ?? '30'), 10) || 30
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  return {
    startDate,
    endDate: null,
    dateParams: [startDate.toISOString()],
    dateFilter: (alias: string) => {
      const p = alias ? `${alias}.createdAt` : 'createdAt'
      return `${p} >= ?`
    }
  }
}

// GET /api/reports/daily/:date/summary — дневная сводка
router.get('/daily/:date/summary', asyncHandler(async (req, res) => {
  const d = String(req.params.date || '').slice(0, 10)
  if (!d) { res.status(400).json({ message: 'date required' }); return }
  const db = await getDb()
  const ordersCount = await db.get<any>(
    `SELECT COUNT(1) as c FROM orders WHERE substr(createdAt,1,10) = ?`, d
  )
  const sums = await db.get<any>(
    `SELECT 
        COALESCE(SUM(i.price * i.quantity), 0) as total_revenue,
        COALESCE(SUM(i.quantity), 0) as items_qty,
        COALESCE(SUM(i.clicks), 0) as total_clicks,
        COALESCE(SUM(i.sheets), 0) as total_sheets,
        COALESCE(SUM(i.waste), 0) as total_waste
     FROM items i
     JOIN orders o ON o.id = i.orderId
    WHERE substr(o.createdAt,1,10) = ?`, d
  )
  const prepay = await db.get<any>(
    `SELECT 
        COALESCE(SUM(CASE WHEN prepaymentStatus IN ('paid','successful') THEN prepaymentAmount ELSE 0 END),0) as paid_amount,
        COALESCE(SUM(CASE WHEN prepaymentStatus NOT IN ('paid','successful') THEN prepaymentAmount ELSE 0 END),0) as pending_amount,
        COALESCE(SUM(prepaymentAmount),0) as total_amount,
        COALESCE(SUM(CASE WHEN prepaymentStatus IN ('paid','successful') THEN 1 ELSE 0 END),0) as paid_count,
        COALESCE(SUM(CASE WHEN paymentMethod = 'online' AND prepaymentStatus IN ('paid','successful') THEN prepaymentAmount ELSE 0 END),0) as online_paid_amount,
        COALESCE(SUM(CASE WHEN paymentMethod = 'offline' AND prepaymentStatus IN ('paid','successful') THEN prepaymentAmount ELSE 0 END),0) as offline_paid_amount,
        COALESCE(SUM(CASE WHEN paymentMethod = 'online' THEN 1 ELSE 0 END),0) as online_count,
        COALESCE(SUM(CASE WHEN paymentMethod = 'offline' THEN 1 ELSE 0 END),0) as offline_count
       FROM orders WHERE substr(createdAt,1,10) = ?`, d
  )
  const materials = await db.all<any>(
    `SELECT m.id as materialId, m.name as material_name,
            SUM(CASE WHEN mm.delta < 0 THEN -mm.delta ELSE 0 END) AS spent
       FROM material_moves mm
       JOIN materials m ON m.id = mm.material_id
      WHERE substr(mm.created_at,1,10) = ?
      GROUP BY m.id, m.name
      ORDER BY spent DESC
      LIMIT 5`, d
  )
  // Расчёт долга клиентов (итог из items с учётом скидки)
  const debtInfo = await db.get<any>(
    `WITH order_totals AS (
       SELECT o.id,
         (1 - COALESCE(o.discount_percent, 0) / 100.0) * COALESCE(SUM(i.price * i.quantity), 0) AS ord_total,
         COALESCE(o.prepaymentAmount, 0) AS prepay
       FROM orders o
       LEFT JOIN items i ON i.orderId = o.id
       WHERE substr(COALESCE(o.created_at, o.createdAt), 1, 10) = ?
       GROUP BY o.id
     )
     SELECT 
       COALESCE(SUM(ord_total), 0) AS total_orders_amount,
       COALESCE(SUM(prepay), 0) AS total_prepayment_amount,
       COALESCE(SUM(ord_total) - SUM(prepay), 0) AS total_debt
     FROM order_totals`,
    d
  )

  let debtClosedToday = 0
  try {
    const row = await db.get<{ s: number }>(
      'SELECT COALESCE(SUM(amount), 0) AS s FROM debt_closed_events WHERE closed_date = ?',
      d
    )
    debtClosedToday = Number(row?.s ?? 0)
  } catch {
    /* таблица может отсутствовать до миграции */
  }

  res.json({
    date: d,
    orders_count: Number((ordersCount as any)?.c || 0),
    total_revenue: Number(sums?.total_revenue || 0),
    items_qty: Number(sums?.items_qty || 0),
    total_clicks: Number(sums?.total_clicks || 0),
    total_sheets: Number(sums?.total_sheets || 0),
    total_waste: Number(sums?.total_waste || 0),
    prepayment: prepay,
    debt: debtInfo,
    debt_closed_today: debtClosedToday,
    materials_spent_top: materials
  })
}))

// GET /api/reports/daily/:date/orders — заказы и позиции за день (глобально)
router.get('/daily/:date/orders', asyncHandler(async (req, res) => {
  const d = String(req.params.date || '').slice(0, 10)
  if (!d) { res.status(400).json({ message: 'date required' }); return }

  const db = await getDb()
  let hasPrepaymentUpdatedAt = false
  try {
    hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt')
  } catch {
    hasPrepaymentUpdatedAt = false
  }
  const dateExpr = hasPrepaymentUpdatedAt
    ? "COALESCE(o.prepaymentUpdatedAt, o.created_at, o.createdAt)"
    : "COALESCE(o.created_at, o.createdAt)"
  const prepaymentUpdatedAtSelect = hasPrepaymentUpdatedAt ? 'o.prepaymentUpdatedAt' : 'NULL as prepaymentUpdatedAt'
  const orders = await db.all<any>(
    `SELECT o.id, o.number, o.status,
            COALESCE(o.created_at, o.createdAt) as created_at,
            ${prepaymentUpdatedAtSelect},
            o.customerName, o.customerPhone, o.customerEmail,
            o.prepaymentAmount, o.prepaymentStatus, o.paymentMethod, o.userId
       FROM orders o
      WHERE substr(${dateExpr},1,10) = ?
      ORDER BY o.id DESC`,
    d
  )

  for (const order of orders) {
    const items = await db.all<any>(
      'SELECT id, orderId, type, params, price, quantity, printerId, sides, sheets, waste, clicks FROM items WHERE orderId = ?',
      order.id
    )
    order.items = items.map((item: any) => ({
      ...item,
      params: item.params ? JSON.parse(item.params) : {}
    }))
  }

  res.json({ date: d, orders })
}))

// GET /api/reports/analytics/products/popularity — популярность продуктов
router.get('/analytics/products/popularity', asyncHandler(async (req, res) => {
  const { limit = '10' } = req.query
  const limitNum = parseInt(limit as string) || 10
  const { startDate, endDate, dateParams, dateFilter } = getAnalyticsDateRange(req.query)
  const days = endDate
    ? Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000)
    : parseInt(String(req.query.period || '30'), 10) || 30

  const db = await getDb()

  const productPopularity = await db.all<any>(
    `SELECT i.type as product_type, COUNT(DISTINCT o.id) as order_count, SUM(i.quantity) as total_quantity,
      SUM(i.price * i.quantity) as total_revenue, AVG(i.price) as avg_price, MAX(o.createdAt) as last_order_date
     FROM items i JOIN orders o ON o.id = i.orderId
     WHERE ${dateFilter('o')}
     GROUP BY i.type ORDER BY total_revenue DESC LIMIT ?`,
    [...dateParams, limitNum]
  )

  const categoryStats = await db.all<any>(
    `SELECT CASE WHEN LOWER(i.type) LIKE '%визит%' THEN 'Визитки'
        WHEN LOWER(i.type) LIKE '%листов%' OR LOWER(i.type) LIKE '%flyer%' THEN 'Листовки'
        WHEN LOWER(i.type) LIKE '%буклет%' OR LOWER(i.type) LIKE '%каталог%' THEN 'Буклеты/Каталоги'
        WHEN LOWER(i.type) LIKE '%плакат%' OR LOWER(i.type) LIKE '%poster%' THEN 'Плакаты'
        WHEN LOWER(i.type) LIKE '%календар%' THEN 'Календари' ELSE 'Другое' END as category,
      COUNT(DISTINCT o.id) as order_count, SUM(i.quantity) as total_quantity, SUM(i.price * i.quantity) as total_revenue
     FROM items i JOIN orders o ON o.id = i.orderId WHERE ${dateFilter('o')}
     GROUP BY category ORDER BY total_revenue DESC`,
    dateParams
  )

  const productTrends = await db.all<any>(
    `SELECT DATE(o.createdAt) as date, i.type as product_type, COUNT(DISTINCT o.id) as daily_orders,
      SUM(i.price * i.quantity) as daily_revenue
     FROM items i JOIN orders o ON o.id = i.orderId WHERE ${dateFilter('o')}
     GROUP BY DATE(o.createdAt), i.type ORDER BY date DESC, daily_revenue DESC`,
    dateParams
  )

  const averageOrderValue = await db.all<any>(
    `SELECT i.type as product_type, AVG(i.price * i.quantity) as avg_order_value, COUNT(DISTINCT o.id) as orders_with_product
     FROM items i JOIN orders o ON o.id = i.orderId WHERE ${dateFilter('o')}
     GROUP BY i.type HAVING orders_with_product >= 3 ORDER BY avg_order_value DESC`,
    dateParams
  )

  res.json({
    period: { days, startDate: startDate.toISOString(), endDate: endDate?.toISOString() ?? undefined },
    productPopularity,
    categoryStats,
    productTrends,
    averageOrderValue
  })
}))

// GET /api/reports/analytics/financial/profitability — финансовая аналитика
router.get('/analytics/financial/profitability', asyncHandler(async (req, res) => {
  const { startDate, endDate, dateParams, dateFilter } = getAnalyticsDateRange(req.query)
  const days = endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) : parseInt(String(req.query.period || '30'), 10) || 30
  const db = await getDb()

  const productProfitability = await db.all<any>(`
    SELECT i.type as product_type, SUM(i.price * i.quantity) as total_revenue, COUNT(DISTINCT o.id) as order_count,
      AVG(i.price * i.quantity) as avg_order_value, SUM(i.quantity) as total_items
    FROM items i JOIN orders o ON o.id = i.orderId WHERE ${dateFilter('o')}
    GROUP BY i.type ORDER BY total_revenue DESC
  `, dateParams)

  const paymentAnalysis = await db.get<any>(`
    SELECT COUNT(CASE WHEN paymentMethod = 'online' THEN 1 END) as online_orders,
      COUNT(CASE WHEN paymentMethod = 'offline' THEN 1 END) as offline_orders,
      COUNT(CASE WHEN paymentMethod = 'telegram' THEN 1 END) as telegram_orders,
      SUM(CASE WHEN paymentMethod = 'online' AND prepaymentStatus IN ('paid','successful') THEN prepaymentAmount ELSE 0 END) as online_revenue,
      SUM(CASE WHEN paymentMethod = 'offline' AND prepaymentStatus IN ('paid','successful') THEN prepaymentAmount ELSE 0 END) as offline_revenue,
      SUM(CASE WHEN paymentMethod = 'telegram' AND prepaymentStatus IN ('paid','successful') THEN prepaymentAmount ELSE 0 END) as telegram_revenue,
      AVG(CASE WHEN prepaymentStatus IN ('paid','successful') THEN prepaymentAmount END) as avg_payment_amount
    FROM orders WHERE ${dateFilter('')}
  `, dateParams)

  const prepaymentAnalysis = await db.get<any>(`
    SELECT COUNT(CASE WHEN prepaymentStatus IN ('paid','successful') THEN 1 END) as paid_prepayments,
      COUNT(CASE WHEN prepaymentStatus NOT IN ('paid','successful') THEN 1 END) as pending_prepayments,
      SUM(CASE WHEN prepaymentStatus IN ('paid','successful') THEN prepaymentAmount ELSE 0 END) as total_paid_prepayment,
      SUM(CASE WHEN prepaymentStatus NOT IN ('paid','successful') THEN prepaymentAmount ELSE 0 END) as total_pending_prepayment,
      AVG(CASE WHEN prepaymentStatus IN ('paid','successful') THEN prepaymentAmount ELSE 0 END) as avg_paid_prepayment
    FROM orders WHERE ${dateFilter('')} AND prepaymentAmount > 0
  `, dateParams)

  const createdExpr = 'COALESCE(o.createdAt, o.created_at)'
  const currentRangeCondition = endDate
    ? `${createdExpr} >= ? AND ${createdExpr} <= ?`
    : `${createdExpr} >= ?`
  const currentRangeParams = endDate ? [startDate.toISOString(), endDate.toISOString()] : [startDate.toISOString()]

  const avgCheckTrend = await db.all<any>(`
    WITH order_totals AS (
      SELECT
        o.id as order_id,
        DATE(${createdExpr}) as date,
        (1 - COALESCE(o.discount_percent, 0) / 100.0) * COALESCE(SUM(i.price * i.quantity), 0) as order_total
      FROM orders o
      LEFT JOIN items i ON i.orderId = o.id
      WHERE ${currentRangeCondition}
      GROUP BY o.id, DATE(${createdExpr})
    )
    SELECT
      date,
      COUNT(order_id) as orders_count,
      COALESCE(SUM(order_total), 0) as total_revenue,
      COALESCE(AVG(order_total), 0) as avg_check
    FROM order_totals
    GROUP BY date
    ORDER BY date
  `, currentRangeParams)

  const currentAvgRow = await db.get<any>(`
    WITH order_totals AS (
      SELECT
        o.id as order_id,
        (1 - COALESCE(o.discount_percent, 0) / 100.0) * COALESCE(SUM(i.price * i.quantity), 0) as order_total
      FROM orders o
      LEFT JOIN items i ON i.orderId = o.id
      WHERE ${currentRangeCondition}
      GROUP BY o.id
    )
    SELECT COALESCE(AVG(order_total), 0) as avg_check, COUNT(order_id) as orders_count
    FROM order_totals
  `, currentRangeParams)

  const compareEnd = endDate ? new Date(endDate) : new Date()
  const compareSpanMs = Math.max(24 * 60 * 60 * 1000, compareEnd.getTime() - startDate.getTime())
  const prevEnd = new Date(startDate.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - compareSpanMs)
  const prevRangeParams = [prevStart.toISOString(), prevEnd.toISOString()]
  const prevAvgRow = await db.get<any>(`
    WITH order_totals AS (
      SELECT
        o.id as order_id,
        (1 - COALESCE(o.discount_percent, 0) / 100.0) * COALESCE(SUM(i.price * i.quantity), 0) as order_total
      FROM orders o
      LEFT JOIN items i ON i.orderId = o.id
      WHERE ${createdExpr} >= ? AND ${createdExpr} <= ?
      GROUP BY o.id
    )
    SELECT COALESCE(AVG(order_total), 0) as avg_check, COUNT(order_id) as orders_count
    FROM order_totals
  `, prevRangeParams)

  const currentAvgCheck = Number(currentAvgRow?.avg_check ?? 0)
  const previousAvgCheck = Number(prevAvgRow?.avg_check ?? 0)
  const trendPercent = previousAvgCheck > 0 ? ((currentAvgCheck - previousAvgCheck) / previousAvgCheck) * 100 : null

  res.json({
    period: { days, startDate: startDate.toISOString(), endDate: endDate?.toISOString() ?? undefined },
    productProfitability,
    paymentAnalysis,
    prepaymentAnalysis,
    avgCheckTrend,
    avgCheckSummary: {
      current_avg_check: currentAvgCheck,
      current_orders_count: Number(currentAvgRow?.orders_count ?? 0),
      previous_avg_check: previousAvgCheck,
      previous_orders_count: Number(prevAvgRow?.orders_count ?? 0),
      trend_percent: trendPercent
    }
  })
}))

// GET /api/reports/analytics/orders/status-funnel — анализ статусов заказов
router.get('/analytics/orders/status-funnel', asyncHandler(async (req, res) => {
  const { startDate, endDate, dateParams, dateFilter } = getAnalyticsDateRange(req.query)
  const days = endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) : parseInt(String(req.query.period || '30'), 10) || 30
  const db = await getDb()

  const statusFunnel = await db.all<any>(`
    SELECT CASE WHEN status = 0 THEN 'Создан' WHEN status = 1 THEN 'Подтвержден' WHEN status = 2 THEN 'В работе'
      WHEN status = 3 THEN 'Готов' WHEN status = 4 THEN 'Выдан' WHEN status = 5 THEN 'Отменен' ELSE 'Неизвестный' END as status_name,
      status, COUNT(*) as count, SUM(COALESCE(prepaymentAmount, 0)) as total_amount, AVG(COALESCE(prepaymentAmount, 0)) as avg_amount
    FROM orders WHERE ${dateFilter('')}
    GROUP BY status, status_name ORDER BY status
  `, dateParams)

  const statusConversion = await db.all<any>(`
    SELECT DATE(createdAt) as date, COUNT(CASE WHEN status >= 1 THEN 1 END) as confirmed_orders,
      COUNT(CASE WHEN status >= 2 THEN 1 END) as in_progress_orders, COUNT(CASE WHEN status >= 3 THEN 1 END) as ready_orders,
      COUNT(CASE WHEN status >= 4 THEN 1 END) as completed_orders, COUNT(*) as total_created
    FROM orders WHERE ${dateFilter('')}
    GROUP BY DATE(createdAt) ORDER BY date DESC
  `, dateParams)

  const avgProcessingTime = await db.all<any>(`
    SELECT AVG(JULIANDAY(updatedAt) - JULIANDAY(createdAt)) * 24 as avg_hours_to_complete, COUNT(*) as completed_orders
    FROM orders WHERE status = 4 AND ${dateFilter('')} AND updatedAt > createdAt
  `, dateParams)

  const cancellationReasons = await db.all<any>(`
    SELECT COUNT(*) as cancelled_count, SUM(COALESCE(prepaymentAmount, 0)) as cancelled_amount
    FROM orders WHERE status = 5 AND ${dateFilter('')}
  `, dateParams)

  res.json({
    period: { days, startDate: startDate.toISOString(), endDate: endDate?.toISOString() ?? undefined },
    statusFunnel,
    statusConversion,
    avgProcessingTime: avgProcessingTime[0],
    cancellationReasons: cancellationReasons[0]
  })
}))

// GET /api/reports/analytics/orders/list — первичка заказов для drill-down из KPI
router.get('/analytics/orders/list', asyncHandler(async (req, res) => {
  const { startDate, endDate, dateParams, dateFilter } = getAnalyticsDateRange(req.query)
  const db = await getDb()

  const statusFilter = req.query.status ? String(req.query.status) : 'all'
  const reasonFilter = req.query.reason_filter ? String(req.query.reason_filter) : ''
  const departmentIdParam = req.query.department_id ? Number(req.query.department_id) : undefined
  const departmentId = Number.isFinite(departmentIdParam) ? Number(departmentIdParam) : undefined
  const limitRaw = Number(req.query.limit ?? 200)
  const limit = Math.min(1000, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 200))

  const where: string[] = [dateFilter('o')]
  const params: any[] = [...dateParams]

  if (departmentId !== undefined) {
    where.push('u.department_id = ?')
    params.push(departmentId)
  }

  if (statusFilter && statusFilter !== 'all') {
    if (statusFilter === 'paid') {
      where.push(`o.prepaymentStatus IN ('paid','successful')`)
    } else if (statusFilter === 'pending_payment') {
      where.push(`COALESCE(o.prepaymentAmount, 0) > 0 AND o.prepaymentStatus NOT IN ('paid','successful')`)
    } else if (statusFilter === 'completed') {
      where.push('o.status = 4')
    } else if (statusFilter === 'cancelled') {
      where.push('o.status = 5')
    } else if (statusFilter === 'created') {
      where.push('o.status = 0')
    } else {
      const numericStatus = Number(statusFilter)
      if (Number.isFinite(numericStatus)) {
        where.push('o.status = ?')
        params.push(numericStatus)
      }
    }
  }

  const ageHoursExpr = `(JULIANDAY('now') - JULIANDAY(COALESCE(o.createdAt, o.created_at))) * 24`
  if (reasonFilter) {
    if (reasonFilter === 'cancellation_no_prepayment') {
      where.push('o.status = 5 AND COALESCE(o.prepaymentAmount, 0) = 0')
    } else if (reasonFilter === 'cancellation_unpaid_prepayment') {
      where.push(`o.status = 5 AND COALESCE(o.prepaymentAmount, 0) > 0 AND o.prepaymentStatus NOT IN ('paid','successful')`)
    } else if (reasonFilter === 'cancellation_after_paid') {
      where.push(`o.status = 5 AND o.prepaymentStatus IN ('paid','successful')`)
    } else if (reasonFilter === 'delay_waiting_payment') {
      where.push(`o.status IN (0,1,2,3) AND COALESCE(o.prepaymentAmount, 0) > 0 AND o.prepaymentStatus NOT IN ('paid','successful') AND ${ageHoursExpr} > 24`)
    } else if (reasonFilter === 'delay_long_production') {
      where.push(`o.status IN (2,3) AND ${ageHoursExpr} > 48`)
    } else if (reasonFilter === 'delay_initial_stuck') {
      where.push(`o.status IN (0,1) AND ${ageHoursExpr} > 24`)
    } else {
      const hasCancellationEvents = !!(await db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='order_cancellation_events'"
      ))
      if (hasCancellationEvents) {
        where.push(`EXISTS (
          SELECT 1 FROM order_cancellation_events e
          WHERE e.order_id = o.id AND e.reason_code = ?
        )`)
        params.push(reasonFilter)
      }
    }
  }

  const rows = await db.all<any>(`
    SELECT
      o.id,
      o.number,
      o.status,
      COALESCE(o.createdAt, o.created_at) as created_at,
      o.prepaymentStatus as prepayment_status,
      o.paymentMethod as payment_method,
      COALESCE(o.prepaymentAmount, 0) as prepayment_amount,
      COALESCE(o.discount_percent, 0) as discount_percent,
      u.id as user_id,
      COALESCE(u.name, u.email, 'Без оператора') as user_name,
      COALESCE(i_totals.raw_total, 0) * (1 - COALESCE(o.discount_percent, 0) / 100.0) as order_total
    FROM orders o
    LEFT JOIN users u ON u.id = o.userId
    LEFT JOIN (
      SELECT i.orderId as order_id, SUM(i.price * i.quantity) as raw_total
      FROM items i
      GROUP BY i.orderId
    ) i_totals ON i_totals.order_id = o.id
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(o.createdAt, o.created_at) DESC
    LIMIT ?
  `, [...params, limit])

  const summary = rows.reduce((acc: { total_orders: number; total_revenue: number }, row: any) => {
    acc.total_orders += 1
    acc.total_revenue += Number(row.order_total || 0)
    return acc
  }, { total_orders: 0, total_revenue: 0 })

  res.json({
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate?.toISOString() ?? undefined
    },
    filters: {
      status: statusFilter,
      reason_filter: reasonFilter || null,
      department_id: departmentId ?? null,
      limit
    },
    summary,
    orders: rows
  })
}))

// GET /api/reports/analytics/orders/reasons — топ причин отмен и задержек (эвристики)
router.get('/analytics/orders/reasons', asyncHandler(async (req, res) => {
  const { startDate, endDate, dateParams, dateFilter } = getAnalyticsDateRange(req.query)
  const db = await getDb()
  const departmentIdParam = req.query.department_id ? Number(req.query.department_id) : undefined
  const departmentId = Number.isFinite(departmentIdParam) ? Number(departmentIdParam) : undefined

  const baseWhere: string[] = [dateFilter('o')]
  const baseParams: any[] = [...dateParams]
  if (departmentId !== undefined) {
    baseWhere.push('u.department_id = ?')
    baseParams.push(departmentId)
  }

  const hasCancellationEvents = !!(await db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='order_cancellation_events'"
  ))

  let cancellationRows: any[] = []
  if (hasCancellationEvents) {
    const eventWhere: string[] = []
    const eventParams: any[] = []
    if (endDate) {
      eventWhere.push("e.created_at >= ? AND e.created_at <= ?")
      eventParams.push(startDate.toISOString(), endDate.toISOString())
    } else {
      eventWhere.push("e.created_at >= ?")
      eventParams.push(startDate.toISOString())
    }
    if (departmentId !== undefined) {
      eventWhere.push('u.department_id = ?')
      eventParams.push(departmentId)
    }
    cancellationRows = await db.all<any>(`
      SELECT
        COALESCE(e.reason, 'Не указано') as reason,
        COALESCE(e.reason_code, 'unspecified') as reason_code,
        COUNT(*) as count
      FROM order_cancellation_events e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE ${eventWhere.join(' AND ')}
      GROUP BY reason, reason_code
      ORDER BY count DESC
      LIMIT 10
    `, eventParams)
  } else {
    cancellationRows = await db.all<any>(`
      SELECT
        CASE
          WHEN COALESCE(o.prepaymentAmount, 0) = 0 THEN 'Без предоплаты'
          WHEN o.prepaymentStatus IN ('paid','successful') THEN 'После оплаченной предоплаты'
          WHEN COALESCE(o.prepaymentAmount, 0) > 0 AND o.prepaymentStatus NOT IN ('paid','successful') THEN 'Неоплаченная предоплата'
          ELSE 'Прочие'
        END as reason,
        CASE
          WHEN COALESCE(o.prepaymentAmount, 0) = 0 THEN 'cancellation_no_prepayment'
          WHEN o.prepaymentStatus IN ('paid','successful') THEN 'cancellation_after_paid'
          WHEN COALESCE(o.prepaymentAmount, 0) > 0 AND o.prepaymentStatus NOT IN ('paid','successful') THEN 'cancellation_unpaid_prepayment'
          ELSE 'cancellation_other'
        END as reason_code,
        COUNT(*) as count
      FROM orders o
      LEFT JOIN users u ON u.id = o.userId
      WHERE ${baseWhere.join(' AND ')} AND o.status = 5
      GROUP BY reason, reason_code
      ORDER BY count DESC
      LIMIT 10
    `, baseParams)
  }

  const delayedRows = await db.all<any>(`
    SELECT
      CASE
        WHEN COALESCE(o.prepaymentAmount, 0) > 0 AND o.prepaymentStatus NOT IN ('paid','successful') AND (JULIANDAY('now') - JULIANDAY(COALESCE(o.createdAt, o.created_at))) * 24 > 24 THEN 'Ожидание предоплаты >24ч'
        WHEN o.status IN (2,3) AND (JULIANDAY('now') - JULIANDAY(COALESCE(o.createdAt, o.created_at))) * 24 > 48 THEN 'Длительное производство >48ч'
        WHEN o.status IN (0,1) AND (JULIANDAY('now') - JULIANDAY(COALESCE(o.createdAt, o.created_at))) * 24 > 24 THEN 'Долго в начальных статусах >24ч'
        ELSE 'Прочие задержки'
      END as reason,
      CASE
        WHEN COALESCE(o.prepaymentAmount, 0) > 0 AND o.prepaymentStatus NOT IN ('paid','successful') AND (JULIANDAY('now') - JULIANDAY(COALESCE(o.createdAt, o.created_at))) * 24 > 24 THEN 'delay_waiting_payment'
        WHEN o.status IN (2,3) AND (JULIANDAY('now') - JULIANDAY(COALESCE(o.createdAt, o.created_at))) * 24 > 48 THEN 'delay_long_production'
        WHEN o.status IN (0,1) AND (JULIANDAY('now') - JULIANDAY(COALESCE(o.createdAt, o.created_at))) * 24 > 24 THEN 'delay_initial_stuck'
        ELSE 'delay_other'
      END as reason_code,
      COUNT(*) as count
    FROM orders o
    LEFT JOIN users u ON u.id = o.userId
    WHERE ${baseWhere.join(' AND ')}
      AND o.status IN (0,1,2,3)
      AND (JULIANDAY('now') - JULIANDAY(COALESCE(o.createdAt, o.created_at))) * 24 > 24
    GROUP BY reason, reason_code
    ORDER BY count DESC
    LIMIT 10
  `, baseParams)

  const cancellationTotal = cancellationRows.reduce((s, r) => s + Number(r.count || 0), 0)
  const delayedTotal = delayedRows.reduce((s, r) => s + Number(r.count || 0), 0)

  const withPercent = (rows: any[], total: number) =>
    rows.map((r) => ({
      reason: r.reason,
      reason_code: r.reason_code,
      count: Number(r.count || 0),
      percent: total > 0 ? (Number(r.count || 0) / total) * 100 : 0
    }))

  res.json({
    period: { startDate: startDate.toISOString(), endDate: endDate?.toISOString() ?? undefined },
    department_id: departmentId ?? null,
    cancellation_total: cancellationTotal,
    delayed_total: delayedTotal,
    cancellation_reasons: withPercent(cancellationRows, cancellationTotal),
    delay_reasons: withPercent(delayedRows, delayedTotal),
    notes: hasCancellationEvents
      ? 'Причины отмен: фактические (из журнала). Причины задержек: эвристические.'
      : 'Причины рассчитаны эвристически по данным статуса, предоплаты и времени в заказе.'
  })
}))

// GET /api/reports/analytics/reason-presets — пресеты причин для UI отмены/удаления
router.get('/analytics/reason-presets', asyncHandler(async (_req, res) => {
  const db = await getDb()
  await ensureReasonPresetsSettingsTable(db)

  const rows = await db.all<{ setting_key: string; presets_json: string }[]>(
    'SELECT setting_key, presets_json FROM reason_presets_settings WHERE setting_key IN (?, ?, ?)',
    ['delete', 'status_cancel', 'online_cancel']
  )

  const data: Record<string, string[]> = { ...DEFAULT_REASON_PRESETS }
  for (const row of rows as any[]) {
    try {
      const parsed = JSON.parse(row.presets_json)
      data[row.setting_key] = normalizePresets(parsed, DEFAULT_REASON_PRESETS[row.setting_key] || [])
    } catch {
      // ignore broken JSON and keep defaults
    }
  }

  res.json({
    delete: data.delete || DEFAULT_REASON_PRESETS.delete,
    status_cancel: data.status_cancel || DEFAULT_REASON_PRESETS.status_cancel,
    online_cancel: data.online_cancel || DEFAULT_REASON_PRESETS.online_cancel,
  })
}))

// PUT /api/reports/analytics/reason-presets — сохранить пресеты (только admin)
router.put('/analytics/reason-presets', asyncHandler(async (req, res) => {
  const user = (req as any).user as { id?: number; role?: string } | undefined
  if (!user?.id || user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const db = await getDb()
  await ensureReasonPresetsSettingsTable(db)

  const body = (req.body || {}) as Record<string, unknown>
  const payload: Record<string, string[]> = {
    delete: normalizePresets(body.delete, DEFAULT_REASON_PRESETS.delete),
    status_cancel: normalizePresets(body.status_cancel, DEFAULT_REASON_PRESETS.status_cancel),
    online_cancel: normalizePresets(body.online_cancel, DEFAULT_REASON_PRESETS.online_cancel),
  }

  for (const [key, presets] of Object.entries(payload)) {
    const json = JSON.stringify(presets)
    await db.run(
      `INSERT INTO reason_presets_settings (setting_key, presets_json, updated_by, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(setting_key) DO UPDATE SET
         presets_json = excluded.presets_json,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
      [key, json, user.id]
    )
  }

  res.json(payload)
}))

// GET /api/reports/analytics/managers/efficiency — эффективность менеджеров
// Без ограничений по статусам: выручка, средний чек, «Выполнено» и время — по всем заказам. Отмена = статус 5 или is_cancelled=1
router.get('/analytics/managers/efficiency', asyncHandler(async (req, res) => {
  const { department_id: deptIdParam } = req.query
  const departmentId = deptIdParam != null ? parseInt(String(deptIdParam), 10) : undefined
  const { startDate, endDate } = getAnalyticsDateRange(req.query)
  const days = endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) : parseInt(String(req.query.period || '30'), 10) || 30

  const startStr = startDate.toISOString().slice(0, 10)
  const endStr = endDate ? endDate.toISOString().slice(0, 10) : null
  const oCreated = 'COALESCE(o.createdAt, o.created_at)'
  const oDate = `substr(${oCreated}, 1, 10)`
  const oCreatedRange = endStr ? `${oDate} >= ? AND ${oDate} <= ?` : `${oDate} >= ?`
  const managerDateParams = endStr ? [startStr, endStr] : [startStr]

  const db = await getDb()
  const deptCondition = Number.isFinite(departmentId) ? ' AND u.department_id = ? ' : ''
  const deptParam = Number.isFinite(departmentId) ? [departmentId] : []
  const hasIsCancelled = await hasColumn('orders', 'is_cancelled')
  const cancelledCondition = hasIsCancelled ? '(o.status = 5 OR COALESCE(o.is_cancelled, 0) = 1)' : 'o.status = 5'
  const oUpdated = 'COALESCE(o.updatedAt, o.updated_at)'

  const managerEfficiency = await db.all<any>(
    `SELECT u.id as user_id, u.name as user_name, COUNT(o.id) as total_orders,
      COUNT(o.id) as completed_orders,
      COUNT(CASE WHEN ${cancelledCondition} THEN 1 END) as cancelled_orders,
      SUM(COALESCE(o.prepaymentAmount, 0)) as total_revenue,
      AVG(COALESCE(o.prepaymentAmount, 0)) as avg_order_value,
      AVG(CASE WHEN ${oUpdated} > ${oCreated} THEN JULIANDAY(${oUpdated}) - JULIANDAY(${oCreated}) ELSE NULL END) * 24 as avg_processing_hours,
      COUNT(DISTINCT ${oDate}) as active_days, MAX(${oCreated}) as last_order_date
    FROM users u
    LEFT JOIN orders o ON o.userId = u.id AND ${oCreatedRange}
    WHERE u.role IN ('admin', 'manager', 'user') ${deptCondition}
    GROUP BY u.id, u.name HAVING total_orders > 0 ORDER BY total_revenue DESC`,
    [...managerDateParams, ...deptParam]
  )

  const topManagerIds = managerEfficiency.slice(0, 3).map(m => m.user_id)
  const managerDailyStats = topManagerIds.length
    ? await db.all<any>(`
    SELECT o.userId as user_id, ${oDate} as date, COUNT(o.id) as daily_orders,
      SUM(COALESCE(o.prepaymentAmount, 0)) as daily_revenue,
      COUNT(o.id) as daily_completed
    FROM orders o WHERE ${oCreatedRange} AND o.userId IN (${topManagerIds.map(() => '?').join(',')})
    GROUP BY o.userId, ${oDate} ORDER BY date DESC
  `, [...managerDateParams, ...topManagerIds])
    : []

  // Без ограничений по статусам: подтверждённые и выполненные = все заказы
  const managerConversion = await db.all<any>(
    `SELECT u.id as user_id, u.name as user_name,
      COUNT(o.id) as confirmed_orders,
      COUNT(o.id) as completed_orders, COUNT(o.id) as total_orders,
      100.0 as conversion_rate
    FROM users u LEFT JOIN orders o ON o.userId = u.id AND ${oCreatedRange}
    WHERE u.role IN ('admin', 'manager', 'user') ${deptCondition}
    GROUP BY u.id, u.name HAVING total_orders > 0 ORDER BY total_orders DESC`,
    [...managerDateParams, ...deptParam]
  )

  res.json({
    period: { days, startDate: startDate.toISOString(), endDate: endDate?.toISOString() ?? undefined },
    department_id: Number.isFinite(departmentId) ? departmentId : null,
    managerEfficiency,
    managerDailyStats,
    managerConversion
  })
}))

// GET /api/reports/analytics/daily-activity — активность операторов по дням
router.get('/analytics/daily-activity', asyncHandler(async (req, res) => {
  const { startDate, endDate } = getAnalyticsDateRange(req.query)
  const startStr = startDate.toISOString().slice(0, 10)
  const endStr = endDate ? endDate.toISOString().slice(0, 10) : null
  const oCreated = 'COALESCE(o.created_at, o.createdAt)'
  const oDate = `substr(${oCreated}, 1, 10)`
  const oCreatedRange = endStr ? `${oDate} >= ? AND ${oDate} <= ?` : `${oDate} >= ?`
  const dateParams = endStr ? [startStr, endStr] : [startStr]

  const db = await getDb()

  // По каждому дню и оператору: заказы, сумма
  const dailyByUser = await db.all<any>(
    `SELECT ${oDate} as date, u.id as user_id, COALESCE(u.name, u.email, 'Без оператора') as user_name,
       COUNT(o.id) as orders_count,
       COALESCE(SUM(o.prepaymentAmount), 0) as total_amount
     FROM orders o
     LEFT JOIN users u ON o.userId = u.id
     WHERE ${oCreatedRange} AND (o.status IS NULL OR o.status != 5)
     GROUP BY ${oDate}, u.id, u.name, u.email
     ORDER BY date DESC, total_amount DESC`,
    dateParams
  )

  // Итоги по дням (все операторы)
  const dailyTotals = await db.all<any>(
    `SELECT ${oDate} as date,
       COUNT(o.id) as orders_count,
       COALESCE(SUM(o.prepaymentAmount), 0) as total_amount,
       COUNT(DISTINCT o.userId) as operators_count
     FROM orders o
     WHERE ${oCreatedRange} AND (o.status IS NULL OR o.status != 5)
     GROUP BY ${oDate}
     ORDER BY date DESC`,
    dateParams
  )

  // Общая сумма за период
  const overall = await db.get<any>(
    `SELECT COUNT(o.id) as orders_count, COALESCE(SUM(o.prepaymentAmount), 0) as total_amount
     FROM orders o
     WHERE ${oCreatedRange} AND (o.status IS NULL OR o.status != 5)`,
    dateParams
  )

  res.json({
    period: {
      startDate: startStr,
      endDate: endStr ?? startStr,
      days: endStr ? Math.ceil((new Date(endStr).getTime() - new Date(startStr).getTime()) / 86400000) + 1 : 30
    },
    dailyByUser,
    dailyTotals,
    overallTotal: {
      orders_count: Number(overall?.orders_count ?? 0),
      total_amount: Number(overall?.total_amount ?? 0)
    }
  })
}))

// Пустая структура ответа ABC-аналитики материалов (при ошибке или отсутствии данных)
const emptyMaterialsResponse = (period: { days: number; startDate: string; endDate?: string }) => ({
  period,
  abcAnalysis: [] as any[],
  abcSummary: { A: { count: 0, total_cost: 0, percentage: 0 }, B: { count: 0, total_cost: 0, percentage: 0 }, C: { count: 0, total_cost: 0, percentage: 0 } },
  categoryAnalysis: [] as any[],
  totalMaterials: 0,
  totalCost: 0
})

// GET /api/reports/analytics/materials/abc-analysis — ABC-анализ материалов
// material_moves.created_at может быть в формате SQLite (YYYY-MM-DD HH:MM:SS), сравниваем по дате через substr
router.get('/analytics/materials/abc-analysis', asyncHandler(async (req, res) => {
  const { startDate, endDate } = getAnalyticsDateRange(req.query)
  const days = endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) : parseInt(String(req.query.period || '90'), 10) || 90
  const period = { days, startDate: startDate.toISOString(), endDate: endDate?.toISOString() ?? undefined }
  const startStr = startDate.toISOString().slice(0, 10)
  const endStr = endDate ? endDate.toISOString().slice(0, 10) : null
  const matDateRange = endStr
    ? 'substr(mm.created_at, 1, 10) >= ? AND substr(mm.created_at, 1, 10) <= ?'
    : 'substr(mm.created_at, 1, 10) >= ?'
  const matDateParams = endStr ? [startStr, endStr] : [startStr]

  const db = await getDb()

  let materialsConsumption: any[]
  try {
    materialsConsumption = await db.all<any>(`
    SELECT m.id as material_id, m.name as material_name, mc.name as category_name,
      SUM(CASE WHEN mm.delta < 0 THEN -mm.delta ELSE 0 END) as total_consumed,
      SUM(CASE WHEN mm.delta < 0 THEN -mm.delta * COALESCE(mm.price, 0) ELSE 0 END) as total_cost,
      COUNT(DISTINCT substr(mm.created_at, 1, 10)) as usage_days, MAX(mm.created_at) as last_usage,
      AVG(CASE WHEN mm.delta < 0 THEN -mm.delta ELSE NULL END) as avg_daily_consumption
    FROM materials m
    LEFT JOIN material_categories mc ON mc.id = m.category_id
    LEFT JOIN material_moves mm ON mm.material_id = m.id AND ${matDateRange}
    WHERE ${matDateRange}
    GROUP BY m.id, m.name, mc.name HAVING total_consumed > 0 ORDER BY total_cost DESC
  `, [...matDateParams, ...matDateParams])
  } catch (err) {
    console.error('Materials ABC query failed:', err)
    res.json(emptyMaterialsResponse(period))
    return
  }

  const totalCost = materialsConsumption.reduce((sum, m) => sum + m.total_cost, 0)
  const safeTotal = totalCost > 0 ? totalCost : 1

  let cumulativeCost = 0
  const abcAnalysis = materialsConsumption.map(material => {
    cumulativeCost += material.total_cost
    const cumulativePercentage = (cumulativeCost / safeTotal) * 100

    let abc_class, abc_description
    if (cumulativePercentage <= 80) {
      abc_class = 'A'
      abc_description = 'Высокозначимые материалы'
    } else if (cumulativePercentage <= 95) {
      abc_class = 'B'
      abc_description = 'Среднеззначимые материалы'
    } else {
      abc_class = 'C'
      abc_description = 'Низкозначимые материалы'
    }

    return {
      ...material,
      cumulative_cost: cumulativeCost,
      cumulative_percentage: cumulativePercentage,
      abc_class,
      abc_description
    }
  })

  const abcStats = {
    A: abcAnalysis.filter(m => m.abc_class === 'A'),
    B: abcAnalysis.filter(m => m.abc_class === 'B'),
    C: abcAnalysis.filter(m => m.abc_class === 'C')
  }

  const abcSummary = {
    A: {
      count: abcStats.A.length,
      total_cost: abcStats.A.reduce((sum, m) => sum + m.total_cost, 0),
      percentage: abcStats.A.length > 0 ? (abcStats.A.reduce((sum, m) => sum + m.total_cost, 0) / safeTotal * 100) : 0
    },
    B: {
      count: abcStats.B.length,
      total_cost: abcStats.B.reduce((sum, m) => sum + m.total_cost, 0),
      percentage: abcStats.B.length > 0 ? (abcStats.B.reduce((sum, m) => sum + m.total_cost, 0) / safeTotal * 100) : 0
    },
    C: {
      count: abcStats.C.length,
      total_cost: abcStats.C.reduce((sum, m) => sum + m.total_cost, 0),
      percentage: abcStats.C.length > 0 ? (abcStats.C.reduce((sum, m) => sum + m.total_cost, 0) / safeTotal * 100) : 0
    }
  }

  const categoryAnalysis = await db.all<any>(`
    SELECT mc.name as category_name, COUNT(DISTINCT m.id) as materials_count,
      SUM(CASE WHEN mm.delta < 0 THEN -mm.delta ELSE 0 END) as total_consumed,
      SUM(CASE WHEN mm.delta < 0 THEN -mm.delta * COALESCE(mm.price, 0) ELSE 0 END) as total_cost,
      AVG(CASE WHEN mm.delta < 0 THEN -mm.delta ELSE NULL END) as avg_consumption
    FROM material_categories mc
    LEFT JOIN materials m ON m.category_id = mc.id
    LEFT JOIN material_moves mm ON mm.material_id = m.id AND ${matDateRange}
    WHERE ${matDateRange}
    GROUP BY mc.id, mc.name HAVING total_consumed > 0 ORDER BY total_cost DESC
  `, [...matDateParams, ...matDateParams])

  res.json({
    period,
    abcAnalysis,
    abcSummary,
    categoryAnalysis,
    totalMaterials: materialsConsumption.length,
    totalCost
  })
}))

// Рабочие часы: 9:00–20:00. Часы из ISO/SQLite: substr(createdAt, 12, 2)
const WORK_HOUR_START = 9
const WORK_HOUR_END = 20
function workHoursCondition(alias: string): string {
  const col = alias ? `${alias}.createdAt` : 'createdAt'
  const created = `COALESCE(${col}, ${alias ? `${alias}.created_at` : 'created_at'})`
  return `CAST(SUBSTR(${created}, 12, 2) AS INTEGER) BETWEEN ${WORK_HOUR_START} AND ${WORK_HOUR_END}`
}

// GET /api/reports/analytics/time/peak-hours — временная аналитика только по рабочим часам 9–20
router.get('/analytics/time/peak-hours', asyncHandler(async (req, res) => {
  const { startDate, endDate, dateParams, dateFilter } = getAnalyticsDateRange(req.query)
  const days = endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) : parseInt(String(req.query.period || '30'), 10) || 30
  const db = await getDb()
  const dateAndWorkHours = `${dateFilter('o')} AND ${workHoursCondition('o')}`

  const hourlyRaw = await db.all<any>(`
    SELECT CAST(SUBSTR(COALESCE(o.createdAt, o.created_at), 12, 2) AS INTEGER) as hour, COUNT(o.id) as orders_count,
      SUM(COALESCE(o.prepaymentAmount, 0)) as total_revenue,
      AVG(COALESCE(o.prepaymentAmount, 0)) as avg_order_value,
      COUNT(DISTINCT substr(COALESCE(o.createdAt, o.created_at), 1, 10)) as active_days
    FROM orders o WHERE ${dateAndWorkHours}
    GROUP BY hour ORDER BY hour
  `, dateParams)

  // Градация по часам 9–20: заполняем все часы, отсутствующие = 0
  const hourMap = new Map<number, { hour: string; orders_count: number; total_revenue: number; avg_order_value: number | null; active_days: number }>()
  for (let h = WORK_HOUR_START; h <= WORK_HOUR_END; h++) {
    hourMap.set(h, { hour: String(h).padStart(2, '0'), orders_count: 0, total_revenue: 0, avg_order_value: null, active_days: 0 })
  }
  for (const row of hourlyRaw) {
    const h = Number(row.hour)
    if (h >= WORK_HOUR_START && h <= WORK_HOUR_END) {
      hourMap.set(h, {
        hour: String(h).padStart(2, '0'),
        orders_count: row.orders_count,
        total_revenue: row.total_revenue,
        avg_order_value: row.avg_order_value,
        active_days: row.active_days
      })
    }
  }
  const hourlyAnalysis = Array.from({ length: WORK_HOUR_END - WORK_HOUR_START + 1 }, (_, i) => hourMap.get(WORK_HOUR_START + i)!)

  const oDateExpr = "substr(COALESCE(o.createdAt, o.created_at), 1, 10) || ' 00:00:00'"
  const weekdayHourlyRaw = await db.all<any>(`
    SELECT CASE strftime('%w', ${oDateExpr}) WHEN '0' THEN 'Воскресенье' WHEN '1' THEN 'Понедельник'
      WHEN '2' THEN 'Вторник' WHEN '3' THEN 'Среда' WHEN '4' THEN 'Четверг' WHEN '5' THEN 'Пятница' WHEN '6' THEN 'Суббота' END as weekday,
      CAST(SUBSTR(COALESCE(o.createdAt, o.created_at), 12, 2) AS INTEGER) as hour, COUNT(o.id) as orders_count, SUM(COALESCE(o.prepaymentAmount, 0)) as total_revenue
    FROM orders o WHERE ${dateAndWorkHours}
    GROUP BY strftime('%w', ${oDateExpr}), hour, weekday ORDER BY strftime('%w', ${oDateExpr}), hour
  `, dateParams)
  const weekdayHourlyAnalysis = weekdayHourlyRaw.filter((r: any) => r.hour >= WORK_HOUR_START && r.hour <= WORK_HOUR_END)

  const peakAmongWorkHours = hourlyAnalysis.length ? hourlyAnalysis.reduce((max, h) => h.orders_count > max.orders_count ? h : max, hourlyAnalysis[0]) : { hour: '09', orders_count: 0 }
  const peakPeriods = {
    peakHour: peakAmongWorkHours,
    peakWeekday: await db.get<any>(`
      SELECT CASE strftime('%w', ${oDateExpr}) WHEN '0' THEN 'Воскресенье' WHEN '1' THEN 'Понедельник' WHEN '2' THEN 'Вторник'
        WHEN '3' THEN 'Среда' WHEN '4' THEN 'Четверг' WHEN '5' THEN 'Пятница' WHEN '6' THEN 'Суббота' END as weekday,
        COUNT(o.id) as orders_count, SUM(COALESCE(o.prepaymentAmount, 0)) as total_revenue
      FROM orders o WHERE ${dateAndWorkHours}
      GROUP BY strftime('%w', ${oDateExpr}), weekday ORDER BY orders_count DESC LIMIT 1
    `, dateParams) || { weekday: '—', orders_count: 0, total_revenue: 0 },
    busiestTimeSlot: hourlyAnalysis.length ? peakAmongWorkHours : { hour: '09', orders_count: 0 }
  }

  // Сегменты внутри рабочих часов: 9–12, 12–15, 15–18, 18–20
  const timeOfDayTrends = {
    morning: hourlyAnalysis.filter(h => parseInt(h.hour) >= 9 && parseInt(h.hour) < 12).reduce((sum, h) => sum + h.orders_count, 0),
    afternoon: hourlyAnalysis.filter(h => parseInt(h.hour) >= 12 && parseInt(h.hour) < 15).reduce((sum, h) => sum + h.orders_count, 0),
    evening: hourlyAnalysis.filter(h => parseInt(h.hour) >= 15 && parseInt(h.hour) < 18).reduce((sum, h) => sum + h.orders_count, 0),
    night: hourlyAnalysis.filter(h => parseInt(h.hour) >= 18 && parseInt(h.hour) <= 20).reduce((sum, h) => sum + h.orders_count, 0)
  }

  res.json({
    period: { days, startDate: startDate.toISOString(), endDate: endDate?.toISOString() ?? undefined },
    workHours: { start: WORK_HOUR_START, end: WORK_HOUR_END },
    hourlyAnalysis,
    weekdayHourlyAnalysis,
    peakPeriods,
    timeOfDayTrends
  })
}))

// GET /api/materials/report/top — топ материалов по расходу
router.get('/materials/top', asyncHandler(async (req, res) => {
  const { from, to, limit = 10 } = req.query as any
  const where: string[] = []
  const params: any[] = []
  if (from) { where.push('mm.created_at >= ?'); params.push(String(from)) }
  if (to) { where.push('mm.created_at <= ?'); params.push(String(to)) }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT m.id, m.name, SUM(CASE WHEN mm.delta < 0 THEN -mm.delta ELSE 0 END) AS spent
       FROM material_moves mm
       JOIN materials m ON m.id = mm.material_id
      ${whereSql}
      GROUP BY m.id, m.name
      ORDER BY spent DESC
      LIMIT ?`,
    ...params,
    Number(limit)
  )
  res.json(rows)
}))

// GET /api/materials/report/forecast — прогноз заказов материалов
router.get('/materials/forecast', asyncHandler(async (req, res) => {
  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT m.id, m.name, m.unit, m.quantity, m.min_quantity,
            ROUND(m.quantity * 0.5, 2) AS suggested_order
       FROM materials m
      WHERE m.min_quantity IS NOT NULL AND m.quantity <= m.min_quantity
      ORDER BY (m.min_quantity - m.quantity) DESC`
  )
  res.json(rows)
}))

export default router
