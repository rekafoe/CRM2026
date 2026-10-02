import { getDb } from '../config/database'
import { getSmtpConfig } from '../config/mail'
import { renderEmailTemplate } from './emailTemplateService'
import { enqueueMail } from './mailOutboxService'
import { isValidEmailAddress } from '../utils/isValidEmail'
import { logger } from '../utils/logger'
import { buildOrderStatusEmailVars } from './orderStatusEmailVars'
import {
  isCompletedOrderStatus,
  shouldDeferWebsiteReadyEmail,
} from './websiteOrderEmailTiming'

export type OrderEmailSource = 'crm' | 'website' | 'telegram' | 'mini_app'

/**
 * Поставить в очередь письмо клиенту при смене статуса (если есть правило и email).
 * Idempotency: одно письмо на переход (old → new) для заказа.
 */
export async function tryEnqueueOrderStatusEmail(params: {
  orderId: number
  oldStatusId: number
  newStatusId: number
  source?: OrderEmailSource
}): Promise<void> {
  if (params.source === 'telegram') {
    return
  }
  if (params.oldStatusId === params.newStatusId) {
    return
  }
  if (!getSmtpConfig().configured) {
    return
  }

  try {
    const db = await getDb()
    const rule = await db.get<{
      subject_template: string
      body_html_template: string
      body_text_template: string | null
    }>(
      `SELECT t.subject_template, t.body_html_template, t.body_text_template
       FROM order_email_rules r
       INNER JOIN email_templates t ON t.id = r.email_template_id
       WHERE r.to_status_id = ? AND r.is_active = 1 AND t.is_active = 1`,
      [params.newStatusId]
    )
    if (!rule) {
      return
    }

    const order = await db.get<{
      id: number
      number: string | null
      customerName: string | null
      customerEmail: string | null
      customerEmailFromCard: string | null
      source: OrderEmailSource | null
    }>(
      `SELECT
         o.id,
         o.number,
         o.customerName,
         o.customerEmail,
         o.source,
         c.email as customerEmailFromCard
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.id = ?`,
      [params.orderId]
    )
    if (!order) {
      return
    }
    if ((params.source ?? order.source) === 'telegram') {
      return
    }

    const to = (order.customerEmail || order.customerEmailFromCard || '').trim()
    if (!to) {
      logger.debug('Order status email skipped: no customerEmail', { orderId: params.orderId })
      return
    }
    if (!isValidEmailAddress(to)) {
      logger.debug('Order status email skipped: invalid customerEmail', { orderId: params.orderId, to })
      return
    }

    const status = await loadOrderStatusLabel(db, params.newStatusId)
    const statusName = status.name || String(params.newStatusId)
    const source = order.source || params.source
    // «Завершён» уходит только после закрытия долга, не из смены статуса.
    if (isCompletedOrderStatus(status.code, statusName)) {
      return
    }
    // Сайт: о готовности (выполнен, передан или получен в ПВЗ) — отдельная отложка за сутки.
    if (shouldDeferWebsiteReadyEmail(source, status.code, statusName)) {
      return
    }
    const vars = await buildOrderStatusEmailVars({
      orderId: params.orderId,
      statusName,
    })

    const subject = renderEmailTemplate(rule.subject_template, vars)
    const bodyHtml = renderEmailTemplate(rule.body_html_template, vars)
    const bodyText = rule.body_text_template
      ? renderEmailTemplate(rule.body_text_template, vars)
      : undefined

    const idempotencyKey = `order-notify:${params.orderId}:${params.oldStatusId}:${params.newStatusId}`

    await enqueueMail({
      to,
      subject,
      html: bodyHtml,
      text: bodyText,
      jobType: 'transactional',
      idempotencyKey,
      contextOrderId: order.id,
      payload: {
        type: 'order_status',
        orderId: order.id,
        oldStatusId: params.oldStatusId,
        newStatusId: params.newStatusId,
      },
    })
    logger.info('Order status email enqueued', {
      orderId: params.orderId,
      toStatusId: params.newStatusId,
      to,
    })
  } catch (e) {
    logger.warn('Order status email enqueue failed', { error: e, orderId: params.orderId })
  }
}

export async function enqueueOrderEmailBySlug(params: {
  orderId: number
  templateSlug: string
  statusName: string
  idempotencyKey: string
  payload: Record<string, unknown>
}): Promise<'enqueued' | 'duplicate' | 'skipped'> {
  if (!getSmtpConfig().configured) return 'skipped'
  try {
    const db = await getDb()
    const template = await db.get<{
      subject_template: string
      body_html_template: string
      body_text_template: string | null
    }>(
      `SELECT subject_template, body_html_template, body_text_template
       FROM email_templates
       WHERE slug = ? AND is_active = 1`,
      params.templateSlug,
    )
    if (!template) {
      logger.warn('Order email skipped: template missing', {
        orderId: params.orderId,
        slug: params.templateSlug,
      })
      return 'skipped'
    }

    const order = await db.get<{
      id: number
      customerEmail: string | null
      customerEmailFromCard: string | null
    }>(
      `SELECT
         o.id,
         o.customerEmail,
         c.email as customerEmailFromCard
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.id = ?`,
      params.orderId,
    )
    if (!order) return 'skipped'
    const to = (order.customerEmail || order.customerEmailFromCard || '').trim()
    if (!to || !isValidEmailAddress(to)) {
      logger.debug('Order email skipped: no customerEmail', { orderId: params.orderId })
      return 'skipped'
    }

    const vars = await buildOrderStatusEmailVars({
      orderId: params.orderId,
      statusName: params.statusName,
    })
    const result = await enqueueMail({
      to,
      subject: renderEmailTemplate(template.subject_template, vars),
      html: renderEmailTemplate(template.body_html_template, vars),
      text: template.body_text_template
        ? renderEmailTemplate(template.body_text_template, vars)
        : undefined,
      jobType: 'transactional',
      idempotencyKey: params.idempotencyKey,
      contextOrderId: order.id,
      payload: params.payload,
    })
    logger.info('Order email enqueued', {
      orderId: params.orderId,
      slug: params.templateSlug,
      to,
      duplicate: !!result.duplicate,
    })
    return result.duplicate ? 'duplicate' : 'enqueued'
  } catch (e) {
    logger.warn('Order email enqueue failed', { error: e, orderId: params.orderId, slug: params.templateSlug })
    return 'skipped'
  }
}

async function loadOrderStatusLabel(
  db: Awaited<ReturnType<typeof getDb>>,
  statusId: number,
): Promise<{ code: string | null; name: string | null }> {
  try {
    const row = await db.get<{ name?: string | null; code?: string | null }>(
      'SELECT name, code FROM order_statuses WHERE id = ?',
      statusId,
    )
    return { code: row?.code ?? null, name: row?.name ?? null }
  } catch {
    const row = await db.get<{ name?: string | null }>(
      'SELECT name FROM order_statuses WHERE id = ?',
      statusId,
    )
    return { code: null, name: row?.name ?? null }
  }
}
