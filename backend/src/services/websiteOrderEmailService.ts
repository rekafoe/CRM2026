import { getDb } from '../config/database'
import { getSmtpConfig } from '../config/mail'
import { logger } from '../utils/logger'
import { hasColumn } from '../utils/tableSchemaCache'
import { parseItemParams, resolveOrderReadyAtMs, type ReadySlaItem } from '../utils/orderReadySla'
import { enqueueOrderEmailBySlug } from './orderStatusEmailService'
import {
  isCompletedOrderStatus,
  isReadyNotifyStatus,
  isWebsiteReadyReminderDue,
} from './websiteOrderEmailTiming'

const READY_TEMPLATE_SLUG = 'order_ready_for_pickup'
const COMPLETED_TEMPLATE_SLUG = 'order_completed'
const SCAN_DAYS = 60

type ReadyCandidate = {
  id: number
  created_at: string | null
  status_name: string | null
  status_code: string | null
}

/**
 * Заказ с сайта уже готов (выполнен, в ПВЗ или получен в ПВЗ) —
 * письмо о готовности ставится в очередь не раньше чем за сутки до даты.
 */
export async function processWebsiteReadyReminders(limit = 40, nowMs = Date.now()): Promise<number> {
  if (!getSmtpConfig().configured) return 0
  const capped = Math.max(1, Math.min(200, Math.floor(limit) || 40))
  try {
    const db = await getDb()
    const rows = await selectReadyCandidates(db, capped)
    if (rows.length === 0) return 0
    const itemsByOrder = await loadReadyItems(db, rows.map((row) => row.id))
    let enqueued = 0
    for (const row of rows) {
      const readyMs = resolveOrderReadyAtMs({
        created_at: row.created_at,
        source: 'website',
        items: itemsByOrder.get(row.id) ?? [],
      })
      if (!isWebsiteReadyReminderDue(readyMs, nowMs)) continue
      if (!(await stillReadyForReminder(db, row.id))) continue
      const result = await enqueueOrderEmailBySlug({
        orderId: row.id,
        templateSlug: READY_TEMPLATE_SLUG,
        statusName: row.status_name || 'Выполнен',
        idempotencyKey: `website-ready-reminder:${row.id}`,
        payload: {
          type: 'website_ready_reminder',
          orderId: row.id,
          readyAt: readyMs != null ? new Date(readyMs).toISOString() : null,
        },
      })
      if (result === 'enqueued') enqueued += 1
    }
    return enqueued
  } catch (e) {
    logger.warn('Website ready reminder scan failed', { error: e })
    return 0
  }
}

/** Письмо «завершён» только для сайта и только когда долг уже закрыт выдачей. */
export async function tryEnqueueWebsiteOrderCompletedEmail(orderId: number): Promise<void> {
  if (!Number.isFinite(orderId)) return
  if (!getSmtpConfig().configured) return
  try {
    const db = await getDb()
    const order = await loadWebsiteOrderGate(db, orderId)
    if (!order || order.source !== 'website') return
    if (Number(order.is_cancelled) === 1) return
    const status = await loadStatus(db, order.status)
    if (!isCompletedOrderStatus(status.code, status.name)) return
    await enqueueOrderEmailBySlug({
      orderId,
      templateSlug: COMPLETED_TEMPLATE_SLUG,
      statusName: status.name || 'Завершён',
      idempotencyKey: `order-notify-completed:${orderId}`,
      payload: { type: 'order_completed_debt_closed', orderId },
    })
  } catch (e) {
    logger.warn('Website completed email enqueue failed', { error: e, orderId })
  }
}

async function selectReadyCandidates(
  db: Awaited<ReturnType<typeof getDb>>,
  limit: number,
): Promise<ReadyCandidate[]> {
  const createdExpr = await createdAtExpr(db)
  const cancelledSql = (await hasColumn('orders', 'is_cancelled').catch(() => false))
    ? 'AND COALESCE(o.is_cancelled, 0) = 0'
    : ''
  const readySql = `(
    s.code IN ('done', 'at_pickup', 'picked_up')
    OR s.name IN ('Выполнен', 'Готов', 'Передан в ПВЗ', 'Получен в ПВЗ')
  )`
  const sql = `
    SELECT o.id,
           ${createdExpr} as created_at,
           s.name as status_name,
           s.code as status_code
    FROM orders o
    INNER JOIN order_statuses s ON s.id = o.status
    WHERE o.source = 'website'
      ${cancelledSql}
      AND ${readySql}
      AND ${createdExpr} >= datetime('now', '-${SCAN_DAYS} days')
      AND NOT EXISTS (
        SELECT 1 FROM mail_jobs mj
        WHERE mj.idempotency_key = 'website-ready-reminder:' || o.id
      )
    ORDER BY o.id
    LIMIT ?`
  try {
    const rows = await db.all<ReadyCandidate[]>(sql, limit)
    return (Array.isArray(rows) ? rows : []).filter((row) =>
      isReadyNotifyStatus(row.status_code, row.status_name),
    )
  } catch {
    const fallback = `
      SELECT o.id,
             ${createdExpr} as created_at,
             s.name as status_name,
             NULL as status_code
      FROM orders o
      INNER JOIN order_statuses s ON s.id = o.status
      WHERE o.source = 'website'
        ${cancelledSql}
        AND s.name IN ('Выполнен', 'Готов', 'Передан в ПВЗ', 'Получен в ПВЗ')
        AND ${createdExpr} >= datetime('now', '-${SCAN_DAYS} days')
        AND NOT EXISTS (
          SELECT 1 FROM mail_jobs mj
          WHERE mj.idempotency_key = 'website-ready-reminder:' || o.id
        )
      ORDER BY o.id
      LIMIT ?`
    const rows = await db.all<ReadyCandidate[]>(fallback, limit)
    return Array.isArray(rows) ? rows : []
  }
}

async function createdAtExpr(db: Awaited<ReturnType<typeof getDb>>): Promise<string> {
  const hasSnake = await hasColumn('orders', 'created_at').catch(() => false)
  const hasCamel = await hasColumn('orders', 'createdAt').catch(() => false)
  if (hasSnake && hasCamel) return 'COALESCE(o.created_at, o.createdAt)'
  if (hasSnake) return 'o.created_at'
  if (hasCamel) return 'o.createdAt'
  return 'NULL'
}

async function loadReadyItems(
  db: Awaited<ReturnType<typeof getDb>>,
  orderIds: number[],
): Promise<Map<number, ReadySlaItem[]>> {
  const map = new Map<number, ReadySlaItem[]>()
  if (orderIds.length === 0) return map
  const placeholders = orderIds.map(() => '?').join(',')
  try {
    const rows = await db.all<Array<{ orderId: number; type: string | null; params: unknown }>>(
      `SELECT orderId, type, params FROM items WHERE orderId IN (${placeholders})`,
      ...orderIds,
    )
    for (const row of Array.isArray(rows) ? rows : []) {
      const list = map.get(row.orderId) ?? []
      list.push({ type: row.type, params: parseItemParams(row.params) })
      map.set(row.orderId, list)
    }
  } catch (e) {
    logger.debug('Website ready reminder: items unavailable', { error: e })
  }
  return map
}

async function stillReadyForReminder(
  db: Awaited<ReturnType<typeof getDb>>,
  orderId: number,
): Promise<boolean> {
  try {
    const row = await db.get<{
      source: string | null
      code: string | null
      name: string | null
      is_cancelled: number | null
    }>(
      `SELECT o.source, s.code, s.name, COALESCE(o.is_cancelled, 0) as is_cancelled
       FROM orders o
       INNER JOIN order_statuses s ON s.id = o.status
       WHERE o.id = ?`,
      orderId,
    )
    if (!row || row.source !== 'website') return false
    if (Number(row.is_cancelled) === 1) return false
    return isReadyNotifyStatus(row.code, row.name)
  } catch {
    const row = await db.get<{ source: string | null; name: string | null }>(
      `SELECT o.source, s.name
       FROM orders o
       INNER JOIN order_statuses s ON s.id = o.status
       WHERE o.id = ?`,
      orderId,
    )
    return !!row && row.source === 'website' && isReadyNotifyStatus(null, row.name)
  }
}

async function loadWebsiteOrderGate(
  db: Awaited<ReturnType<typeof getDb>>,
  orderId: number,
): Promise<{ source: string | null; status: number; is_cancelled: number | null } | undefined> {
  try {
    return await db.get(
      `SELECT source, status, COALESCE(is_cancelled, 0) as is_cancelled FROM orders WHERE id = ?`,
      orderId,
    )
  } catch {
    const row = await db.get<{ source: string | null; status: number }>(
      `SELECT source, status FROM orders WHERE id = ?`,
      orderId,
    )
    return row ? { ...row, is_cancelled: 0 } : undefined
  }
}

async function loadStatus(
  db: Awaited<ReturnType<typeof getDb>>,
  statusId: number,
): Promise<{ code: string | null; name: string | null }> {
  try {
    const row = await db.get<{ code?: string | null; name?: string | null }>(
      `SELECT code, name FROM order_statuses WHERE id = ?`,
      statusId,
    )
    return { code: row?.code ?? null, name: row?.name ?? null }
  } catch {
    const row = await db.get<{ name?: string | null }>(
      `SELECT name FROM order_statuses WHERE id = ?`,
      statusId,
    )
    return { code: null, name: row?.name ?? null }
  }
}
