import { getDb } from '../config/database';
import { getSmtpConfig } from '../config/mail';
import { renderEmailTemplate } from './emailTemplateService';
import { enqueueMail } from './mailOutboxService';
import { logger } from '../utils/logger';

export type OrderEmailSource = 'website' | 'telegram';

/**
 * Поставить в очередь письмо клиенту при смене статуса (если есть правило и email).
 * Idempotency: одно письмо на переход (old → new) для заказа.
 */
export async function tryEnqueueOrderStatusEmail(params: {
  orderId: number;
  oldStatusId: number;
  newStatusId: number;
  source: OrderEmailSource;
}): Promise<void> {
  if (params.source === 'telegram') {
    return;
  }
  if (params.oldStatusId === params.newStatusId) {
    return;
  }
  if (!getSmtpConfig().configured) {
    return;
  }

  try {
    const db = await getDb();
    const rule = await db.get<{
      subject_template: string;
      body_html_template: string;
      body_text_template: string | null;
    }>(
      `SELECT t.subject_template, t.body_html_template, t.body_text_template
       FROM order_email_rules r
       INNER JOIN email_templates t ON t.id = r.email_template_id
       WHERE r.to_status_id = ? AND r.is_active = 1 AND t.is_active = 1`,
      [params.newStatusId]
    );
    if (!rule) {
      return;
    }

    const order = await db.get<{
      id: number;
      number: string | null;
      customerName: string | null;
      customerEmail: string | null;
    }>(
      `SELECT id, number, customerName, customerEmail FROM orders WHERE id = ?`,
      [params.orderId]
    );
    if (!order) {
      return;
    }

    const to = (order.customerEmail || '').trim();
    if (!to) {
      logger.debug('Order status email skipped: no customerEmail', { orderId: params.orderId });
      return;
    }

    const st = await db.get<{ name: string }>(
      'SELECT name FROM order_statuses WHERE id = ?',
      params.newStatusId
    );
    const statusName = st?.name || String(params.newStatusId);
    const customerName = (order.customerName || '').trim() || 'клиент';
    const orderNumber = (order.number || `site-ord-${order.id}`).trim();

    const vars: Record<string, string> = {
      orderId: String(order.id),
      orderNumber,
      statusName,
      customerName,
    };

    const subject = renderEmailTemplate(rule.subject_template, vars);
    const bodyHtml = renderEmailTemplate(rule.body_html_template, vars);
    const bodyText = rule.body_text_template
      ? renderEmailTemplate(rule.body_text_template, vars)
      : undefined;

    const idempotencyKey = `order-notify:${params.orderId}:${params.oldStatusId}:${params.newStatusId}`;

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
    });
    logger.info('Order status email enqueued', {
      orderId: params.orderId,
      toStatusId: params.newStatusId,
      to,
    });
  } catch (e) {
    logger.warn('Order status email enqueue failed', { error: e, orderId: params.orderId });
  }
}
