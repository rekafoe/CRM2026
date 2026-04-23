import { getMailOutboxIntervalMs, getSmtpConfig, isMailOutboxWorkerEnabled } from '../config/mail';
import { processMailOutboxBatch } from './mailOutboxService';
import { getDb } from '../config/database';
import { logger } from '../utils/logger';

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Сброс застрявших в `sending` (после падения процесса).
 */
async function resetStuckSending(): Promise<void> {
  try {
    const db = await getDb();
    const r = await db.run(
      `UPDATE mail_jobs SET status = 'pending', updated_at = datetime('now') WHERE status = 'sending'`
    );
    if (r.changes) {
      logger.info('Mail outbox: reset stuck sending jobs', { count: r.changes });
    }
  } catch (e) {
    logger.warn('Mail outbox: reset sending failed', e);
  }
}

/**
 * Фоновый воркер в процессе API: опрашивает очередь.
 */
export function startMailOutboxWorker(): void {
  if (timer) return;
  if (!isMailOutboxWorkerEnabled()) {
    logger.info('Mail outbox worker disabled (MAIL_OUTBOX_ENABLED=false)');
    return;
  }
  if (!getSmtpConfig().configured) {
    logger.info('Mail outbox worker not started: SMTP not configured (SMTP_HOST, SMTP_FROM)');
    return;
  }

  const interval = getMailOutboxIntervalMs();
  void resetStuckSending().then(() => {
    void processMailOutboxBatch(10);
  });

  timer = setInterval(() => {
    void processMailOutboxBatch(10);
  }, interval);

  logger.info('Mail outbox worker started', { intervalMs: interval });
}

export function stopMailOutboxWorkerForTests(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
