import { randomBytes } from 'crypto';
import { getDb } from '../config/database';
import { isMailOpenTrackingEnabled } from '../config/mail';
import { getPublicApiBaseUrl } from './customerEmailMarketingService';
import { isValidEmailAddress } from '../utils/isValidEmail';

export type MailJobType = 'transactional' | 'marketing';
export type MailJobStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface EnqueueMailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  jobType?: MailJobType;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  /** Для отчёта/фильтра: заказ CRM (уведомления о статусе) */
  contextOrderId?: number | null;
}

/**
 * Поставить письмо в очередь. При дубликате idempotency_key — вернёт существующий id.
 */
export async function enqueueMail(input: EnqueueMailInput): Promise<{ id: number; duplicate?: boolean }> {
  const to = String(input.to || '').trim();
  if (!isValidEmailAddress(to)) {
    throw new Error('Invalid recipient email address');
  }

  const db = await getDb();
  const payloadJson = input.payload ? JSON.stringify(input.payload) : null;
  const maxAttempts = input.maxAttempts ?? 5;
  const jobType = input.jobType ?? 'transactional';

  if (input.idempotencyKey) {
    const existing = await db.get<{ id: number }>(
      'SELECT id FROM mail_jobs WHERE idempotency_key = ?',
      input.idempotencyKey
    );
    if (existing) {
      return { id: existing.id, duplicate: true };
    }
  }

  const ctx =
    input.contextOrderId != null && Number.isFinite(Number(input.contextOrderId))
      ? Number(input.contextOrderId)
      : null;

  let bodyHtml = input.html ?? null;
  let openToken: string | null = null;
  if (jobType === 'marketing' && isMailOpenTrackingEnabled() && bodyHtml) {
    const base = getPublicApiBaseUrl();
    if (base) {
      openToken = randomBytes(20).toString('hex');
      const safeBase = base.replace(/\/$/, '');
      const pixelUrl = `${safeBase}/api/mail/track/open/${openToken}`;
      bodyHtml = `${bodyHtml}\n<!-- open --><img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;overflow:hidden" />`;
    }
  }

  try {
    const r = await db.run(
      `INSERT INTO mail_jobs (
        job_type, to_email, subject, body_html, body_text, status,
        idempotency_key, max_attempts, payload_json, next_attempt_at, context_order_id, open_token
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      jobType,
      to,
      input.subject,
      bodyHtml,
      input.text ?? null,
      input.idempotencyKey ?? null,
      maxAttempts,
      payloadJson,
      null,
      ctx,
      openToken
    );
    return { id: r.lastID ?? 0 };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (input.idempotencyKey && msg.includes('UNIQUE')) {
      const row = await db.get<{ id: number }>(
        'SELECT id FROM mail_jobs WHERE idempotency_key = ?',
        input.idempotencyKey
      );
      if (row) return { id: row.id, duplicate: true };
    }
    throw e;
  }
}

export { processMailOutboxBatch, processOneMailJob } from './mailOutboxProcess';

export async function getMailOutboxStats(): Promise<{
  pending: number;
  failed: number;
  sent24h: number;
}> {
  const db = await getDb();
  const p = await db.get<{ c: number }>("SELECT COUNT(1) as c FROM mail_jobs WHERE status = 'pending'");
  const f = await db.get<{ c: number }>("SELECT COUNT(1) as c FROM mail_jobs WHERE status = 'failed'");
  const s = await db.get<{ c: number }>(
    `SELECT COUNT(1) as c FROM mail_jobs WHERE status = 'sent'
     AND created_at >= datetime('now', '-1 day')`
  );
  return {
    pending: Number(p?.c ?? 0),
    failed: Number(f?.c ?? 0),
    sent24h: Number(s?.c ?? 0),
  };
}

export interface MailJobListRow {
  id: number;
  to_email: string;
  subject: string;
  status: string;
  attempts: number;
  last_error: string | null;
  job_type: string;
  created_at: string;
  updated_at: string;
  first_opened_at: string | null;
  bounce_noted_at: string | null;
}

/**
 * Ручная отметка bounce по id задания (webhook/почта админа позже).
 */
export async function noteMailJobBounce(jobId: number): Promise<{ ok: true } | { ok: false; error: 'not_found' }> {
  const id = Number(jobId);
  if (!Number.isFinite(id) || id < 1) {
    return { ok: false, error: 'not_found' };
  }
  const db = await getDb();
  const r = await db.run(
    `UPDATE mail_jobs
     SET bounce_noted_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    [id]
  );
  const changes = (r as { changes?: number })?.changes ?? 0;
  if (changes < 1) return { ok: false, error: 'not_found' };
  return { ok: true };
}

/**
 * Письма в очереди, связанные с заказом (context_order_id).
 */
export async function listMailJobsForOrder(
  orderId: number,
  limit: number = 30
): Promise<MailJobListRow[]> {
  const db = await getDb();
  const lim = Math.min(100, Math.max(1, limit));
  const rows = (await db.all(
    `SELECT id, to_email, subject, status, attempts, last_error, job_type, created_at, updated_at,
            first_opened_at, bounce_noted_at
     FROM mail_jobs
     WHERE context_order_id = ?
     ORDER BY id DESC
     LIMIT ?`,
    orderId,
    lim
  )) as MailJobListRow[];
  return Array.isArray(rows) ? rows : [];
}
