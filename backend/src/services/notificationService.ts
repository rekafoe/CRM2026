import { getDb } from '../config/database'
import { logger } from '../utils/logger'

export type NotificationChannel = 'email' | 'sms' | 'telegram' | 'push'

/*
TODO (NotificationService functional roadmap - no setup details):
1) EmailProvider: implement SMTP send (Nodemailer) with HTML/text rendering
2) SMSProvider: adapter interface and first provider (e.g., SMS.ru/Twilio)
3) TelegramProvider: Bot API sender with formatting and rate limiting
4) PushProvider: Web Push (VAPID) support and payload encryption
5) Queue worker: consume notifications (status=queued) with retry/backoff and DLQ
6) Template engine: variables validation, preview rendering, i18n, partials
7) Rate limiting: per-channel/per-recipient throttling and burst control
8) Idempotency: deduplicate identical notifications by idempotency key/window
9) Audit log: delivery logs with request/response, error codes, latency
10) Webhooks: outbound delivery events (sent/failed/open/click when supported)
11) User preferences: per-user channel/topic subscriptions and quiet hours
12) Batch sending: campaign jobs with chunking and progress tracking
13) Attachments: support files/inline images where channel allows
14) Scheduling: delayed send and timezone-aware scheduling windows
15) Admin endpoints: manage templates, list/filter notifications, retry/cancel
16) Observability: metrics (success rate, retries, queue size), alerts
17) Security: sanitize variables, prevent header injection and link spoofing
*/

export interface NotificationRequest {
  templateKey: string
  channel: NotificationChannel
  to: string
  variables: Record<string, string | number>
}

export class NotificationService {
  // queue insert; delivery providers can be implemented via worker later
  static async enqueue(req: NotificationRequest) {
    const db = await getDb()

    // load template
    const tpl = await db.get<{ subject?: string; body: string }>(
      'SELECT subject, body FROM notification_templates WHERE key = ? AND is_active = 1',
      req.templateKey
    )

    if (!tpl) {
      throw new Error(`Template not found: ${req.templateKey}`)
    }

    // simple variable replacement
    const withVars = (s: string) =>
      Object.entries(req.variables).reduce((acc, [k, v]) => acc.replace(new RegExp(`{${k}}`, 'g'), String(v)), s)

    const payload = {
      subject: tpl.subject ? withVars(tpl.subject) : undefined,
      body: withVars(tpl.body)
    }

    await db.run(
      'INSERT INTO notifications (template_key, channel, to_address, payload, status) VALUES (?, ?, ?, ?, ?)',
      req.templateKey,
      req.channel,
      req.to,
      JSON.stringify(payload),
      'queued'
    )

    logger.info('Notification enqueued', { channel: req.channel, template: req.templateKey })
  }

  /**
   * Back-compat: используется в некоторых сервисах как периодическая проверка уведомлений по заказам.
   * Сейчас логика рассылок реализуется через очередь `notifications`, поэтому делаем no-op.
   */
  static async checkOrderNotifications(): Promise<void> {
    return
  }
}
