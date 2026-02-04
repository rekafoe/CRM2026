import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'

const router = Router()

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

  res.json({
    period: { days, startDate: startDate.toISOString(), endDate: endDate?.toISOString() ?? undefined },
    productProfitability,
    paymentAnalysis,
    prepaymentAnalysis
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

// GET /api/reports/analytics/managers/efficiency — эффективность менеджеров
// «Выполнено» = статусы 3,4,6 (Готов, Выдан, Завершён); отмена = статус 5 или is_cancelled=1
// Сравнение по дате через substr: в БД created_at может быть YYYY-MM-DD HH:MM:SS, иначе часть заказов теряется
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
      COUNT(CASE WHEN o.status IN (3, 4, 6) THEN 1 END) as completed_orders,
      COUNT(CASE WHEN ${cancelledCondition} THEN 1 END) as cancelled_orders,
      SUM(CASE WHEN o.status IN (3, 4, 6) THEN COALESCE(o.prepaymentAmount, 0) ELSE 0 END) as total_revenue,
      AVG(CASE WHEN o.status IN (3, 4, 6) THEN COALESCE(o.prepaymentAmount, 0) ELSE NULL END) as avg_order_value,
      AVG(CASE WHEN o.status IN (3, 4, 6) AND ${oUpdated} > ${oCreated} THEN JULIANDAY(${oUpdated}) - JULIANDAY(${oCreated}) ELSE NULL END) * 24 as avg_processing_hours,
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
      SUM(CASE WHEN o.status IN (3, 4, 6) THEN COALESCE(o.prepaymentAmount, 0) ELSE 0 END) as daily_revenue,
      COUNT(CASE WHEN o.status IN (3, 4, 6) THEN 1 END) as daily_completed
    FROM orders o WHERE ${oCreatedRange} AND o.userId IN (${topManagerIds.map(() => '?').join(',')})
    GROUP BY o.userId, ${oDate} ORDER BY date DESC
  `, [...managerDateParams, ...topManagerIds])
    : []

  const managerConversion = await db.all<any>(
    `SELECT u.id as user_id, u.name as user_name,
      COUNT(CASE WHEN o.status >= 1 THEN 1 END) as confirmed_orders,
      COUNT(CASE WHEN o.status >= 4 THEN 1 END) as completed_orders, COUNT(o.id) as total_orders,
      ROUND(CAST(COUNT(CASE WHEN o.status >= 4 THEN 1 END) AS FLOAT) / NULLIF(COUNT(CASE WHEN o.status >= 1 THEN 1 END), 0) * 100, 1) as conversion_rate
    FROM users u LEFT JOIN orders o ON o.userId = u.id AND ${oCreatedRange}
    WHERE u.role IN ('admin', 'manager', 'user') ${deptCondition}
    GROUP BY u.id, u.name HAVING total_orders > 0 ORDER BY conversion_rate DESC`,
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
    return res.json(emptyMaterialsResponse(period))
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

// GET /api/reports/analytics/time/peak-hours — временная аналитика
router.get('/analytics/time/peak-hours', asyncHandler(async (req, res) => {
  const { startDate, endDate, dateParams, dateFilter } = getAnalyticsDateRange(req.query)
  const days = endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) : parseInt(String(req.query.period || '30'), 10) || 30
  const db = await getDb()

  const hourlyAnalysis = await db.all<any>(`
    SELECT strftime('%H', o.createdAt) as hour, COUNT(o.id) as orders_count,
      SUM(COALESCE(o.prepaymentAmount, 0)) as total_revenue,
      AVG(COALESCE(o.prepaymentAmount, 0)) as avg_order_value,
      COUNT(DISTINCT DATE(o.createdAt)) as active_days
    FROM orders o WHERE ${dateFilter('o')}
    GROUP BY strftime('%H', o.createdAt) ORDER BY hour
  `, dateParams)

  const weekdayHourlyAnalysis = await db.all<any>(`
    SELECT CASE strftime('%w', o.createdAt) WHEN '0' THEN 'Воскресенье' WHEN '1' THEN 'Понедельник'
      WHEN '2' THEN 'Вторник' WHEN '3' THEN 'Среда' WHEN '4' THEN 'Четверг' WHEN '5' THEN 'Пятница' WHEN '6' THEN 'Суббота' END as weekday,
      strftime('%H', o.createdAt) as hour, COUNT(o.id) as orders_count, SUM(COALESCE(o.prepaymentAmount, 0)) as total_revenue
    FROM orders o WHERE ${dateFilter('o')}
    GROUP BY strftime('%w', o.createdAt), strftime('%H', o.createdAt), weekday ORDER BY strftime('%w', o.createdAt), hour
  `, dateParams)

  const peakPeriods = {
    peakHour: hourlyAnalysis.reduce((max, hour) =>
      hour.orders_count > max.orders_count ? hour : max, hourlyAnalysis[0] || { hour: '0', orders_count: 0 }),
    peakWeekday: await db.get<any>(`
      SELECT CASE strftime('%w', o.createdAt) WHEN '0' THEN 'Воскресенье' WHEN '1' THEN 'Понедельник' WHEN '2' THEN 'Вторник'
        WHEN '3' THEN 'Среда' WHEN '4' THEN 'Четверг' WHEN '5' THEN 'Пятница' WHEN '6' THEN 'Суббота' END as weekday,
        COUNT(o.id) as orders_count, SUM(COALESCE(o.prepaymentAmount, 0)) as total_revenue
      FROM orders o WHERE ${dateFilter('o')}
      GROUP BY strftime('%w', o.createdAt), weekday ORDER BY orders_count DESC LIMIT 1
    `, dateParams),
    busiestTimeSlot: await db.get<any>(`
      SELECT strftime('%H', o.createdAt) as hour, COUNT(o.id) as orders_count
      FROM orders o WHERE ${dateFilter('o')}
      GROUP BY strftime('%H', o.createdAt) ORDER BY orders_count DESC LIMIT 1
    `, dateParams)
  }

  const timeOfDayTrends = {
    morning: hourlyAnalysis.filter(h => parseInt(h.hour) >= 6 && parseInt(h.hour) < 12).reduce((sum, h) => sum + h.orders_count, 0),
    afternoon: hourlyAnalysis.filter(h => parseInt(h.hour) >= 12 && parseInt(h.hour) < 18).reduce((sum, h) => sum + h.orders_count, 0),
    evening: hourlyAnalysis.filter(h => parseInt(h.hour) >= 18 && parseInt(h.hour) < 24).reduce((sum, h) => sum + h.orders_count, 0),
    night: hourlyAnalysis.filter(h => parseInt(h.hour) >= 0 && parseInt(h.hour) < 6).reduce((sum, h) => sum + h.orders_count, 0)
  }

  res.json({
    period: { days, startDate: startDate.toISOString(), endDate: endDate?.toISOString() ?? undefined },
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
