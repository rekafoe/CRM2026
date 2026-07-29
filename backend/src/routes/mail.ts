import dns from 'dns/promises';
import net from 'net';
import nodemailer from 'nodemailer';
import { Router } from 'express';
import { asyncHandler } from '../middleware';
import type { AuthenticatedRequest } from '../middleware/auth';
import { mailBroadcastRateLimit } from '../middleware/rateLimiter';
import {
  getMailOutboxIntervalMs,
  getSmtpConfig,
  getSmtpSocketFamily,
  getSmtpTimeoutMs,
  isMailOutboxWorkerEnabled,
} from '../config/mail';
import { getDb } from '../config/database';
import {
  enqueueMail,
  getMailOutboxStats,
  listMailJobsForOrder,
  noteMailJobBounce,
  processMailOutboxBatch,
} from '../services/mailOutboxService';
import {
  countMarketingOptIn,
  getPublicApiBaseUrl,
  unsubscribeByToken,
} from '../services/customerEmailMarketingService';
import { enqueueMarketingTemplateBroadcast } from '../services/mailMarketingBroadcastService';
import { getTrackingPixelResponse, recordMailOpenByToken } from '../services/mailOpenTrackingService';
import { isValidEmailAddress } from '../utils/isValidEmail';
import { logger } from '../utils/logger';

const router = Router();

type DiagnosticStep = {
  ok: boolean;
  ms: number;
  error?: string;
  code?: string;
  address?: string;
  family?: number;
};

function getErrorInfo(error: unknown): { error: string; code?: string } {
  const err = error as { message?: string; code?: string };
  return {
    error: err?.message || String(error),
    code: err?.code,
  };
}

async function checkTcpConnection(host: string, port: number, family: 4 | 6 | undefined, timeoutMs: number): Promise<DiagnosticStep> {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, family });
    let settled = false;
    const finish = (result: Omit<DiagnosticStep, 'ms'>) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ...result, ms: Date.now() - started });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ ok: true }));
    socket.once('timeout', () => finish({ ok: false, error: 'TCP connection timeout', code: 'ETIMEDOUT' }));
    socket.once('error', (error) => finish({ ok: false, ...getErrorInfo(error) }));
  });
}

async function runSmtpDiagnostics(): Promise<{
  configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  family?: 4 | 6;
  timeoutMs: number;
  dns: DiagnosticStep;
  tcp: DiagnosticStep | null;
  smtp: DiagnosticStep | null;
}> {
  const cfg = getSmtpConfig();
  const family = getSmtpSocketFamily();
  const timeoutMs = Math.min(getSmtpTimeoutMs(), 15_000);
  const dnsStarted = Date.now();
  let dnsResult: DiagnosticStep;
  try {
    const resolved = await dns.lookup(cfg.host, family ? { family } : undefined);
    dnsResult = {
      ok: true,
      ms: Date.now() - dnsStarted,
      address: resolved.address,
      family: resolved.family,
    };
  } catch (error) {
    dnsResult = { ok: false, ms: Date.now() - dnsStarted, ...getErrorInfo(error) };
  }

  const tcpResult = cfg.host && cfg.port
    ? await checkTcpConnection(cfg.host, cfg.port, family, timeoutMs)
    : null;

  let smtpResult: DiagnosticStep | null = null;
  if (cfg.configured && tcpResult?.ok) {
    const smtpStarted = Date.now();
    try {
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        connectionTimeout: timeoutMs,
        greetingTimeout: timeoutMs,
        socketTimeout: timeoutMs,
        ...(family != null ? { family } : {}),
        auth:
          cfg.user && cfg.pass
            ? {
                user: cfg.user,
                pass: cfg.pass,
              }
            : undefined,
      });
      await transporter.verify();
      transporter.close();
      smtpResult = { ok: true, ms: Date.now() - smtpStarted };
    } catch (error) {
      smtpResult = { ok: false, ms: Date.now() - smtpStarted, ...getErrorInfo(error) };
    }
  }

  return {
    configured: cfg.configured,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    family,
    timeoutMs,
    dns: dnsResult,
    tcp: tcpResult,
    smtp: smtpResult,
  };
}

function unsubscribeHtmlPage(ok: boolean, message: string): string {
  const title = ok ? 'Отписка' : 'Ошибка';
  const p = message.replace(/</g, '&lt;');
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head><body><p>${p}</p></body></html>`;
}

function requireAdmin(req: AuthenticatedRequest, res: import('express').Response): boolean {
  const user = req.user;
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

/**
 * GET /api/mail/unsubscribe?token= — публичная отписка (без токена CRM).
 * Дублирование в public routes в auth.ts.
 */
router.get(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    const token = String((req.query as { token?: string }).token || '').trim();
    const r = await unsubscribeByToken(token);
    const wantsJson = (req.headers.accept || '').includes('application/json');
    if (r.ok) {
      if (wantsJson) {
        res.json({ ok: true });
        return;
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(unsubscribeHtmlPage(true, 'Вы отписались от рассылки. Спасибо.'));
      return;
    }
    if (wantsJson) {
      res.status(400).json({ ok: false, error: r.error || 'unsubscribe failed' });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(400).send(unsubscribeHtmlPage(false, r.error || 'Ссылка недействительна или устарела.'));
  })
);

/**
 * GET /api/mail/track/open/:token — пиксель первого открытия (marketing, opt-in MAIL_OPEN_TRACKING).
 */
router.get(
  '/track/open/:token',
  asyncHandler(async (req, res) => {
    const token = String((req.params as { token?: string }).token || '').trim();
    await recordMailOpenByToken(token);
    const { body, contentType } = getTrackingPixelResponse();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
    res.status(200).send(body);
  })
);

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
      host: c.host || undefined,
      port: c.port,
      from: c.from || undefined,
      workerEnabled: isMailOutboxWorkerEnabled(),
      outboxIntervalMs: getMailOutboxIntervalMs(),
    });
  })
);

/**
 * GET /api/mail/diagnostics — DNS/TCP/SMTP verify без отправки письма.
 */
router.get(
  '/diagnostics',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const diagnostics = await runSmtpDiagnostics();
    res.json(diagnostics);
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
 * POST /api/mail/jobs/:id/bounce — зафиксировать bounce по заданию очереди (admin).
 */
router.post(
  '/jobs/:id/bounce',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const id = Number(req.params.id);
    const r = await noteMailJobBounce(id);
    if (!r.ok) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ ok: true, id });
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
 * PATCH /api/mail/order-email-rules/:id — включить/выключить правило и/или сменить шаблон.
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
    const body = (req.body || {}) as { is_active?: boolean; email_template_id?: number };
    if (typeof body.is_active !== 'boolean' && body.email_template_id == null) {
      res.status(400).json({ error: 'is_active and/or email_template_id required' });
      return;
    }
    const db = await getDb();
    if (body.email_template_id != null) {
      const tid = Number(body.email_template_id);
      if (!Number.isFinite(tid) || tid <= 0) {
        res.status(400).json({ error: 'Invalid email_template_id' });
        return;
      }
      const t = await db.get('SELECT id FROM email_templates WHERE id = ?', [tid]);
      if (!t) {
        res.status(400).json({ error: 'Template not found' });
        return;
      }
      await db.run('UPDATE order_email_rules SET email_template_id = ? WHERE id = ?', [tid, id]);
    }
    if (typeof body.is_active === 'boolean') {
      await db.run('UPDATE order_email_rules SET is_active = ? WHERE id = ?', [body.is_active ? 1 : 0, id]);
    }
    const row = await db.get(
      `SELECT r.id, r.to_status_id, r.email_template_id, r.is_active, s.name as status_name, t.slug as template_slug
       FROM order_email_rules r
       LEFT JOIN order_statuses s ON s.id = r.to_status_id
       LEFT JOIN email_templates t ON t.id = r.email_template_id
       WHERE r.id = ?`,
      [id]
    );
    if (!row) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    res.json({ ok: true, rule: row });
  })
);

/**
 * POST /api/mail/order-email-rules — создать правило статус → шаблон.
 * body: { to_status_id, email_template_id, is_active? }
 */
router.post(
  '/order-email-rules',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const body = (req.body || {}) as {
      to_status_id?: number;
      email_template_id?: number;
      is_active?: boolean;
    };
    const statusId = Number(body.to_status_id);
    const templateId = Number(body.email_template_id);
    if (!Number.isFinite(statusId) || statusId <= 0 || !Number.isFinite(templateId) || templateId <= 0) {
      res.status(400).json({ error: 'to_status_id and email_template_id required' });
      return;
    }
    const db = await getDb();
    const status = await db.get('SELECT id FROM order_statuses WHERE id = ?', [statusId]);
    const template = await db.get('SELECT id FROM email_templates WHERE id = ?', [templateId]);
    if (!status || !template) {
      res.status(400).json({ error: 'Status or template not found' });
      return;
    }
    const existing = await db.get<{ id: number }>(
      'SELECT id FROM order_email_rules WHERE to_status_id = ?',
      [statusId]
    );
    if (existing?.id) {
      await db.run(
        'UPDATE order_email_rules SET email_template_id = ?, is_active = ? WHERE id = ?',
        [templateId, body.is_active === false ? 0 : 1, existing.id]
      );
      res.json({ ok: true, id: existing.id, updated: true });
      return;
    }
    const r = await db.run(
      'INSERT INTO order_email_rules (to_status_id, email_template_id, is_active) VALUES (?, ?, ?)',
      [statusId, templateId, body.is_active === false ? 0 : 1]
    );
    res.status(201).json({ ok: true, id: r.lastID, created: true });
  })
);

/**
 * PATCH /api/mail/order-templates/:id — редактировать шаблон письма.
 */
router.patch(
  '/order-templates/:id',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const body = (req.body || {}) as {
      name?: string;
      subject_template?: string;
      body_html_template?: string;
      body_text_template?: string | null;
      is_active?: boolean;
    };
    const db = await getDb();
    const existing = await db.get<{
      id: number
      name: string
      subject_template: string
      body_html_template: string
      body_text_template: string | null
      is_active: number
    }>('SELECT * FROM email_templates WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    await db.run(
      `UPDATE email_templates SET
         name = ?,
         subject_template = ?,
         body_html_template = ?,
         body_text_template = ?,
         is_active = ?
       WHERE id = ?`,
      [
        body.name != null ? String(body.name).trim() : existing.name,
        body.subject_template != null ? String(body.subject_template) : existing.subject_template,
        body.body_html_template != null ? String(body.body_html_template) : existing.body_html_template,
        body.body_text_template !== undefined ? body.body_text_template : existing.body_text_template,
        typeof body.is_active === 'boolean' ? (body.is_active ? 1 : 0) : existing.is_active,
        id,
      ]
    );
    const row = await db.get(
      `SELECT id, slug, name, subject_template, body_html_template, body_text_template, is_active, created_at
       FROM email_templates WHERE id = ?`,
      [id]
    );
    res.json({ ok: true, template: row });
  })
);

/**
 * GET /api/mail/order-statuses — статусы для привязки правил (admin).
 */
router.get(
  '/order-statuses',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const db = await getDb();
    const rows = await db.all(
      `SELECT id, name FROM order_statuses ORDER BY sort_order, id`
    );
    res.json({ statuses: rows || [] });
  })
);

/**
 * POST /api/mail/test — поставить тестовое письмо в очередь.
 * body: { to: string, subject?: string }
 */
/**
 * GET /api/mail/marketing/segment — размер сегмента (согласие + email) для рассылки (admin).
 */
router.get(
  '/marketing/segment',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const count = await countMarketingOptIn();
    const cap = (() => {
      const n = Number(process.env.MAIL_MARKETING_BROADCAST_MAX);
      if (Number.isFinite(n) && n > 0) return Math.min(10_000, n);
      return 500;
    })();
    res.json({
      count,
      maxBroadcast: cap,
      publicApiBaseUrlConfigured: Boolean(getPublicApiBaseUrl()),
    });
  })
);

/**
 * POST /api/mail/marketing/broadcast — поставить в очередь рассылку по шаблону (admin, rate limit).
 * body: { templateId: number }
 */
router.post(
  '/marketing/broadcast',
  mailBroadcastRateLimit,
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req as AuthenticatedRequest, res)) return;
    const c = getSmtpConfig();
    if (!c.configured) {
      res.status(503).json({ error: 'SMTP not configured' });
      return;
    }
    const templateId = Number((req.body as { templateId?: number })?.templateId);
    if (!Number.isFinite(templateId) || templateId < 1) {
      res.status(400).json({ error: 'templateId (positive number) required' });
      return;
    }
    try {
      const r = await enqueueMarketingTemplateBroadcast(templateId);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'broadcast failed';
      res.status(400).json({ error: msg });
    }
  })
);

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
    if (!isValidEmailAddress(to)) {
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

    // Не ждать SMTP (таймаут 20 с + «медленный запрос»): обработка сразу после ответа + воркер
    setImmediate(() => {
      void processMailOutboxBatch(3).catch((e: unknown) => {
        logger.warn('processMailOutboxBatch after /mail/test', {
          error: e instanceof Error ? e.message : String(e),
        });
      });
    });

    res.json({
      ok: true,
      jobId: id,
      duplicate: duplicate ?? false,
      processingAsync: true,
      immediateProcessed: null,
    });
  })
);

export default router;
