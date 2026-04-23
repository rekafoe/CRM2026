import { getDb } from '../config/database';
import { getMailTransporter } from './mailTransportService';
import { getSmtpConfig } from '../config/mail';
import { logger } from '../utils/logger';

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
}

function retryDelaySec(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.min(attempts, 10));
}

/**
 * Поставить письмо в очередь. При дубликате idempotency_key — вернёт существующий id.
 */
export async function enqueueMail(input: EnqueueMailInput): Promise<{ id: number; duplicate?: boolean }> {
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

  try {
    const r = await db.run(
      `INSERT INTO mail_jobs (
        job_type, to_email, subject, body_html, body_text, status,
        idempotency_key, max_attempts, payload_json, next_attempt_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      jobType,
      input.to,
      input.subject,
      input.html ?? null,
      input.text ?? null,
      input.idempotencyKey ?? null,
      maxAttempts,
      payloadJson,
      null
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

async function claimNextJobId(): Promise<number | null> {
  const db = await getDb();
  const now = new Date().toISOString();
  const row = await db.get<{ id: number }>(
    `SELECT id FROM mail_jobs
     WHERE status = 'pending'
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY id ASC
     LIMIT 1`,
    now
  );
  if (!row) return null;

  const upd = await db.run(
    `UPDATE mail_jobs
     SET status = 'sending', updated_at = datetime('now')
     WHERE id = ? AND status = 'pending'`,
    row.id
  );
  if (!upd.changes) return null;
  return row.id;
}

async function markSent(id: number): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE mail_jobs SET status = 'sent', last_error = NULL, updated_at = datetime('now') WHERE id = ?`,
    id
  );
}

async function markFailedOrRetry(
  id: number,
  attempts: number,
  maxAttempts: number,
  errMsg: string
): Promise<void> {
  const db = await getDb();
  if (attempts + 1 >= maxAttempts) {
    await db.run(
      `UPDATE mail_jobs SET status = 'failed', attempts = ?, last_error = ?, updated_at = datetime('now') WHERE id = ?`,
      attempts + 1,
      errMsg.slice(0, 2000),
      id
    );
    return;
  }
  const next = new Date(Date.now() + retryDelaySec(attempts) * 1000).toISOString();
  await db.run(
    `UPDATE mail_jobs SET
      status = 'pending',
      attempts = ?,
      last_error = ?,
      next_attempt_at = ?,
      updated_at = datetime('now')
     WHERE id = ?`,
    attempts + 1,
    errMsg.slice(0, 2000),
    next,
    id
  );
}

/**
 * Обработать одно задание (если есть).
 */
export async function processOneMailJob(): Promise<boolean> {
  const cfg = getSmtpConfig();
  if (!cfg.configured) {
    return false;
  }
  getMailTransporter();

  const id = await claimNextJobId();
  if (id == null) return false;

  const db = await getDb();
  const job = await db.get<{
    to_email: string;
    subject: string;
    body_html: string | null;
    body_text: string | null;
    attempts: number;
    max_attempts: number;
  }>(
    'SELECT to_email, subject, body_html, body_text, attempts, max_attempts FROM mail_jobs WHERE id = ?',
    id
  );
  if (!job) {
    return false;
  }

  try {
    const transport = getMailTransporter();
    if (!transport) {
      throw new Error('Transporter not available');
    }
    await transport.sendMail({
      from: cfg.from,
      to: job.to_email,
      subject: job.subject,
      html: job.body_html ?? undefined,
      text: job.body_text ?? (job.body_html ? undefined : ''),
    });
    await markSent(id);
    logger.info('Mail job sent', { id, to: job.to_email });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('Mail job send failed', { id, error: msg });
    await markFailedOrRetry(id, job.attempts, job.max_attempts, msg);
  }

  return true;
}

const DEFAULT_BATCH = 5;

/**
 * Обработать до batch заданий подряд.
 */
export async function processMailOutboxBatch(batchSize: number = DEFAULT_BATCH): Promise<number> {
  if (!getSmtpConfig().configured) {
    return 0;
  }
  let n = 0;
  for (let i = 0; i < batchSize; i++) {
    const done = await processOneMailJob();
    if (!done) break;
    n += 1;
  }
  return n;
}

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
