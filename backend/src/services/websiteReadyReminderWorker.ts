import { getMailOutboxIntervalMs, getSmtpConfig, isMailOutboxWorkerEnabled } from '../config/mail'
import { logger } from '../utils/logger'
import { processWebsiteReadyReminders } from './websiteOrderEmailService'

let timer: ReturnType<typeof setInterval> | null = null

/**
 * Для заказов с сайта проверяет, не пора ли отправить письмо о готовности
 * (за сутки до планируемой даты, если статус уже «готов» / ПВЗ).
 */
export function startWebsiteReadyReminderWorker(): void {
  if (timer) return
  if (!isMailOutboxWorkerEnabled()) {
    logger.info('Website ready reminder worker disabled (MAIL_OUTBOX_ENABLED=false)')
    return
  }
  if (!getSmtpConfig().configured) {
    logger.info('Website ready reminder worker not started: SMTP not configured')
    return
  }
  const interval = getMailOutboxIntervalMs()
  void processWebsiteReadyReminders()
  timer = setInterval(() => {
    void processWebsiteReadyReminders()
  }, interval)
  logger.info('Website ready reminder worker started', { intervalMs: interval })
}

export function stopWebsiteReadyReminderWorkerForTests(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
