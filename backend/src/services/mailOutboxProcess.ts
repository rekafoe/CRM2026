import { getDb } from '../config/database';
import { getMailFromByJobType, getMarketingSendDelayMs, getSmtpConfig } from '../config/mail';
import { isValidEmailAddress } from '../utils/isValidEmail';
import { logger } from '../utils/logger';
import { getMailTransporter } from './mailTransportService';

function retryDelaySec(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.min(attempts, 10));
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

async function markInvalidRecipientFailed(id: number): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE mail_jobs SET status = 'failed', last_error = ?, updated_at = datetime('now') WHERE id = ?`,
    ['Invalid recipient email address (to_email)', id]
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
    job_type: string;
  }>(
    'SELECT to_email, subject, body_html, body_text, attempts, max_attempts, job_type FROM mail_jobs WHERE id = ?',
    id
  );
  if (!job) {
    return false;
  }

  if (!isValidEmailAddress(job.to_email)) {
    await markInvalidRecipientFailed(id);
    logger.warn('Mail job failed: invalid to_email (skipped SMTP)', { id, to: job.to_email });
    return true;
  }

  try {
    const transport = getMailTransporter();
    if (!transport) {
      throw new Error('Transporter not available');
    }
    const from = getMailFromByJobType(cfg, job.job_type);
    await transport.sendMail({
      from,
      to: job.to_email,
      subject: job.subject,
      html: job.body_html ?? undefined,
      text: job.body_text ?? (job.body_html ? undefined : ''),
    });
    await markSent(id);
    logger.info('Mail job sent', { id, to: job.to_email, jobType: job.job_type });
    if (job.job_type === 'marketing') {
      const d = getMarketingSendDelayMs();
      if (d > 0) {
        await new Promise((r) => setTimeout(r, d));
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const ne = e && typeof e === 'object' ? (e as NodeJS.ErrnoException & { address?: string; port?: number }) : null;
    logger.warn('Mail job send failed', {
      id,
      to: job.to_email,
      error: msg,
      code: ne?.code,
      syscall: ne?.syscall,
      address: ne?.address,
      port: ne?.port,
    });
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
