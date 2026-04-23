import { Router } from 'express';
import { asyncHandler } from '../middleware';
import type { AuthenticatedRequest } from '../middleware/auth';
import { getSmtpConfig } from '../config/mail';
import { enqueueMail, getMailOutboxStats, processMailOutboxBatch } from '../services/mailOutboxService';

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
