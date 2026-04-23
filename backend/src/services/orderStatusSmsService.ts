import { getDb } from '../config/database'
import {
  getSmsQuietEndMinutes,
  getSmsQuietStartMinutes,
  isSmsEnabled,
  getSmsDebounceSeconds,
} from '../config/sms'
import { nextAllowedSendUtc, isMinskInSendWindow } from '../utils/minskSmsSchedule'
import { normalizePhoneForSms } from '../utils/phoneNormalize'
import { renderEmailTemplate } from './emailTemplateService'
import { sendSmsThroughProvider } from './smsProviderService'
import { logger } from '../utils/logger'

type OrderRow = {
  id: number
  number: string | null
  customerName: string | null
  customerPhone: string | null
  source: string | null
  status: number
}

/**
 * Планирование SMS при смене статуса (только source=website, дебаунс + тихие часы).
 * Если для нового статуса нет правила — pending по заказу удаляется.
 */
export async function tryScheduleOrderStatusSms(params: { orderId: number; newStatusId: number }): Promise<void> {
  if (!isSmsEnabled()) {
    return
  }
  const db = await getDb()
  const startM = getSmsQuietStartMinutes()
  const endM = getSmsQuietEndMinutes()

  const hasRule = await db.get<{ c: number }>(
    `SELECT 1 as c FROM order_sms_rules r
     INNER JOIN sms_templates t ON t.id = r.sms_template_id
     WHERE r.to_status_id = ? AND r.is_active = 1 AND t.is_active = 1`,
    [params.newStatusId]
  )
  if (!hasRule) {
    await db.run('DELETE FROM sms_debounce WHERE order_id = ?', [params.orderId])
    return
  }

  const order = await db.get<OrderRow>(
    'SELECT id, number, customerName, customerPhone, source, status FROM orders WHERE id = ?',
    [params.orderId]
  )
  if (!order || (order.source || '') !== 'website') {
    return
  }
  const phone = normalizePhoneForSms(order.customerPhone)
  if (!phone) {
    return
  }

  const deb = getSmsDebounceSeconds()
  const cand = new Date(Date.now() + Math.max(0, deb) * 1000)
  const sendAfter = nextAllowedSendUtc(cand, startM, endM)

  await db.run(
    `INSERT INTO sms_debounce (order_id, target_status_id, send_after, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(order_id) DO UPDATE SET
       target_status_id = excluded.target_status_id,
       send_after = excluded.send_after,
       updated_at = datetime('now')`,
    [params.orderId, params.newStatusId, sendAfter.toISOString()]
  )
}

async function buildRenderedBody(orderId: number, targetStatusId: number): Promise<{ text: string; phone: string; idem: string } | null> {
  const db = await getDb()
  const order = await db.get<OrderRow>(
    'SELECT id, number, customerName, customerPhone, source, status FROM orders WHERE id = ?',
    [orderId]
  )
  if (!order) {
    return null
  }
  const phone = normalizePhoneForSms(order.customerPhone)
  if (!phone) {
    return null
  }
  const rule = await db.get<{ body_template: string }>(
    `SELECT t.body_template
     FROM order_sms_rules r
     INNER JOIN sms_templates t ON t.id = r.sms_template_id
     WHERE r.to_status_id = ? AND r.is_active = 1 AND t.is_active = 1`,
    [targetStatusId]
  )
  if (!rule) {
    return null
  }
  const st = await db.get<{ name: string }>('SELECT name FROM order_statuses WHERE id = ?', [targetStatusId])
  const statusName = st?.name || String(targetStatusId)
  const customerName = (order.customerName || '').trim() || 'клиент'
  const orderNumber = (order.number || `site-ord-${order.id}`).trim()
  const vars: Record<string, string> = {
    orderId: String(order.id),
    orderNumber,
    statusName,
    customerName,
  }
  const text = renderEmailTemplate(rule.body_template, vars)
  const idem = `order-sms-auto:${orderId}:${targetStatusId}`
  return { text, phone, idem }
}

/**
 * Воркер: записи, у которых send_after наступил; при «ночи» — отложить.
 */
export async function processSmsDebounceQueue(limit: number = 20): Promise<number> {
  if (!isSmsEnabled()) {
    return 0
  }
  const startM = getSmsQuietStartMinutes()
  const endM = getSmsQuietEndMinutes()
  const now = new Date()
  const db = await getDb()
  const rows = await db.all(
    `SELECT order_id, target_status_id, send_after FROM sms_debounce
     WHERE send_after <= ? ORDER BY send_after ASC LIMIT ?`,
    [now.toISOString(), limit]
  )

  let done = 0
  for (const row of rows as { order_id: number; target_status_id: number; send_after: string }[]) {
    if (!isMinskInSendWindow(new Date(), startM, endM)) {
      const next = nextAllowedSendUtc(new Date(), startM, endM)
      await db.run('UPDATE sms_debounce SET send_after = ?, updated_at = datetime("now") WHERE order_id = ?', [
        next.toISOString(),
        row.order_id,
      ])
      continue
    }

    const built = await buildRenderedBody(row.order_id, row.target_status_id)
    if (!built) {
      await db.run('DELETE FROM sms_debounce WHERE order_id = ?', [row.order_id])
      continue
    }
    if (await db.get('SELECT 1 as x FROM sms_log WHERE idempotency_key = ?', [built.idem])) {
      await db.run('DELETE FROM sms_debounce WHERE order_id = ?', [row.order_id])
      continue
    }
    let err: string | null = null
    try {
      await sendSmsThroughProvider({ to: built.phone, text: built.text })
    } catch (e: unknown) {
      err = e instanceof Error ? e.message : String(e)
      logger.warn('SMS send failed', { orderId: row.order_id, err })
    }
    await db.run(
      `INSERT INTO sms_log (order_id, phone, body, channel, target_status_id, idempotency_key, error) VALUES (?, ?, ?, 'auto', ?, ?, ?)`,
      [row.order_id, built.phone, built.text, row.target_status_id, built.idem, err]
    )
    await db.run('DELETE FROM sms_debounce WHERE order_id = ?', [row.order_id])
    if (!err) {
      done += 1
    }
  }
  return done
}

export function getNextSendWindowStartUtc(): Date {
  return nextAllowedSendUtc(new Date(), getSmsQuietStartMinutes(), getSmsQuietEndMinutes())
}

/**
 * Ручная отправка: любой source; только customerPhone. Только в окне 8:30–20:00 Minsk.
 */
export async function sendOrderSmsManual(params: {
  orderId: number
  templateId?: number
  body?: string
}): Promise<
  { ok: true; channel: 'manual' } | { ok: false; error: string; nextSendAt?: string }
> {
  if (!isSmsEnabled()) {
    return { ok: false, error: 'SMS отключено (SMS_ENABLED)' }
  }
  const startM = getSmsQuietStartMinutes()
  const endM = getSmsQuietEndMinutes()
  if (!isMinskInSendWindow(new Date(), startM, endM)) {
    return {
      ok: false,
      error: 'Сейчас вне окна отправки SMS (8:30–20:00 по Минску).',
      nextSendAt: getNextSendWindowStartUtc().toISOString(),
    }
  }
  const db = await getDb()
  const order = await db.get<OrderRow>(
    'SELECT id, number, customerName, customerPhone, source, status FROM orders WHERE id = ?',
    [params.orderId]
  )
  if (!order) {
    return { ok: false, error: 'Заказ не найден' }
  }
  const phone = normalizePhoneForSms(order.customerPhone)
  if (!phone) {
    return { ok: false, error: 'Нет номера customerPhone' }
  }
  let text: string
  if (params.body != null && String(params.body).trim() !== '') {
    text = String(params.body)
  } else if (params.templateId != null && Number.isFinite(params.templateId)) {
    const t = await db.get<{ body_template: string; is_active: number }>(
      'SELECT body_template, is_active FROM sms_templates WHERE id = ?',
      [params.templateId]
    )
    if (!t || t.is_active !== 1) {
      return { ok: false, error: 'Шаблон не найден или выключен' }
    }
    const st = await db.get<{ name: string }>('SELECT name FROM order_statuses WHERE id = ?', [order.status])
    const statusName = st?.name || String(order.status)
    const customerName = (order.customerName || '').trim() || 'клиент'
    const orderNumber = (order.number || `ord-${order.id}`).trim()
    const vars: Record<string, string> = {
      orderId: String(order.id),
      orderNumber,
      statusName,
      customerName,
    }
    text = renderEmailTemplate(t.body_template, vars)
  } else {
    return { ok: false, error: 'Укажите body (текст) или templateId' }
  }
  if (text.length > 600) {
    return { ok: false, error: 'Текст слишком длинный' }
  }
  const idem = `order-sms-manual:${order.id}:${Date.now()}`
  let err: string | null = null
  try {
    await sendSmsThroughProvider({ to: phone, text })
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : String(e)
  }
  await db.run(
    `INSERT INTO sms_log (order_id, phone, body, channel, target_status_id, idempotency_key, error) VALUES (?, ?, ?, 'manual', ?, ?, ?)`,
    [order.id, phone, text, order.status, idem, err]
  )
  if (err) {
    return { ok: false, error: err }
  }
  logger.info('SMS manual sent', { orderId: order.id, phone: phone.replace(/\d{4}$/, '****') })
  return { ok: true, channel: 'manual' }
}
