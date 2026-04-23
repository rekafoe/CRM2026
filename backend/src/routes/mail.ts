import { Router } from 'express';
import { asyncHandler } from '../middleware';
import type { AuthenticatedRequest } from '../middleware/auth';
import { getSmtpConfig } from '../config/mail';
import { getDb } from '../config/database';
import {
  enqueueMail,
  getMailOutboxStats,
  listMailJobsForOrder,
  processMailOutboxBatch,
} from '../services/mailOutboxService';

const router = Router();

function requireAdmin(req: AuthenticatedRequest, res: import('express').Response): boolean {
  const user = req.user;
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

/**
 * GET /api/mail/config — проверка, настроен ли SMTP (без секретов).
 */
router.get(
  '/config',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const c = getSmtpConfig();
    res.json({
      configured: c.configured,
      host: c.configured ? c.host : undefined,
      port: c.configured ? c.port : undefined,
    });
  })
);

/**
 * GET /api/mail/stats — счётчики очереди.
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const stats = await getMailOutboxStats();
    res.json(stats);
  })
);

/**
 * GET /api/mail/jobs?orderId= — логи писем по заказу (context_order_id).
 */
router.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const orderId = Number((req.query as { orderId?: string }).orderId);
    if (!Number.isFinite(orderId)) {
      res.status(400).json({ error: 'orderId query required' });
      return;
    }
    const limit = Number((req.query as { limit?: string }).limit) || 30;
    const jobs = await listMailJobsForOrder(orderId, limit);
    res.json({ jobs });
  })
);

/**
 * GET /api/mail/order-templates — шаблоны писем (admin).
 */
router.get(
  '/order-templates',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const db = await getDb();
    const rows = await db.all(
      `SELECT id, slug, name, subject_template, body_html_template, body_text_template, is_active, created_at
       FROM email_templates ORDER BY id`
    );
    res.json({ templates: rows });
  })
);

/**
 * GET /api/mail/order-email-rules — правила «статус → шаблон» (admin).
 */
router.get(
  '/order-email-rules',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const db = await getDb();
    const rules = await db.all(
      `SELECT r.id, r.to_status_id, r.email_template_id, r.is_active, s.name as status_name, t.slug as template_slug
       FROM order_email_rules r
       LEFT JOIN order_statuses s ON s.id = r.to_status_id
       LEFT JOIN email_templates t ON t.id = r.email_template_id
       ORDER BY r.to_status_id`
    );
    res.json({ rules });
  })
);

/**
 * PATCH /api/mail/order-email-rules/:id — включить/выключить правило.
 */
router.patch(
  '/order-email-rules/:id',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const isActive = (req.body as { is_active?: boolean })?.is_active;
    if (typeof isActive !== 'boolean') {
      res.status(400).json({ error: 'is_active (boolean) required' });
      return;
    }
    const db = await getDb();
    const r = await db.run('UPDATE order_email_rules SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
    if (!r.changes) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    res.json({ ok: true, id, is_active: isActive });
  })
);

/**
 * POST /api/mail/test — поставить тестовое письмо в очередь.
 * body: { to: string, subject?: string }
 */
router.post(
  '/test',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const c = getSmtpConfig();
    if (!c.configured) {
      res.status(503).json({
        error: 'SMTP not configured',
        hint: 'Set SMTP_HOST and SMTP_FROM (see env.example and docs/customer-notifications-setup.md)',
      });
      return;
    }
    const to = String((req.body as { to?: string })?.to || '').trim();
    if (!to || !to.includes('@')) {
      res.status(400).json({ error: 'Valid "to" email required' });
      return;
    }
    const subject =
      String((req.body as { subject?: string })?.subject || '').trim() || 'CRM: тест почты (очередь)';
    const { id, duplicate } = await enqueueMail({
      to,
      subject,
      html: '<p>Если вы видите это письмо, очередь <code>mail_jobs</code> и SMTP настроены корректно.</p>',
      text: 'Если вы видите это письмо, очередь mail_jobs и SMTP настроены корректно.',
      jobType: 'transactional',
      idempotencyKey: `mail-test:${to}:${Date.now()}`,
    });

    // Форс одну попытку обработки сразу (не дожидаясь воркера)
    const processed = await processMailOutboxBatch(3);

    res.json({
      ok: true,
      jobId: id,
      duplicate: duplicate ?? false,
      immediateProcessed: processed,
    });
  })
);

export default router;
