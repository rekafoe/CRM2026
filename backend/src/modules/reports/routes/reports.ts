import { Router } from 'express'
import { asyncHandler } from '../../../middleware'
import { getDb } from '../../../config/database'
import { sqlOrderTotalAfterDiscount } from '../../../utils/orderAmountsSql'

const router = Router()

// GET /api/reports/daily/:date/summary — дневная сводка
router.get('/daily/:date/summary', asyncHandler(async (req, res) => {
  const d = String(req.params.date || '').slice(0, 10)
  if (!d) { res.status(400).json({ message: 'date required' }); return }
  const db = await getDb()
  const ordersCount = await db.get<any>(
    `SELECT COUNT(1) as c FROM orders WHERE substr(createdAt,1,10) = ?`, d
  )
  const orderTotalExpr = sqlOrderTotalAfterDiscount('o.id', 'COALESCE(o.discount_percent, 0)')
  const dayCreated = `substr(COALESCE(o.created_at, o.createdAt), 1, 10) = ?`
  const sums = await db.get<any>(
    `SELECT
        (SELECT COALESCE(SUM(${orderTotalExpr}), 0) FROM orders o WHERE ${dayCreated}) as total_revenue,
        (SELECT COALESCE(SUM(i.quantity), 0) FROM items i
           JOIN orders o ON o.id = i.orderId WHERE ${dayCreated}) as items_qty,
        (SELECT COALESCE(SUM(i.clicks), 0) FROM items i
           JOIN orders o ON o.id = i.orderId WHERE ${dayCreated}) as total_clicks,
        (SELECT COALESCE(SUM(i.sheets), 0) FROM items i
           JOIN orders o ON o.id = i.orderId WHERE ${dayCreated}) as total_sheets,
        (SELECT COALESCE(SUM(i.waste), 0) FROM items i
           JOIN orders o ON o.id = i.orderId WHERE ${dayCreated}) as total_waste`,
    d, d, d, d, d,
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
  const ordTotalSql = sqlOrderTotalAfterDiscount('o.id', 'COALESCE(o.discount_percent, 0)')
  const debtInfo = await db.get<any>(
    `SELECT
       COALESCE(SUM(${ordTotalSql}), 0) AS total_orders_amount,
       COALESCE(SUM(COALESCE(o.prepaymentAmount, 0)), 0) AS total_prepayment_amount,
       COALESCE(SUM(${ordTotalSql}) - SUM(COALESCE(o.prepaymentAmount, 0)), 0) AS total_debt
     FROM orders o
     WHERE substr(COALESCE(o.created_at, o.createdAt), 1, 10) = ?`,
    d,
  )

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
    materials_spent_top: materials
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
