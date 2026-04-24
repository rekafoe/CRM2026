import { getDb } from '../../../config/database'
import { renderEmailTemplate } from '../../../services/emailTemplateService'
import { enqueueMail } from '../../../services/mailOutboxService'
import { sendSmsThroughProvider } from '../../../services/smsProviderService'
import { TelegramService } from '../../../services/telegramService'
import { normalizePhoneForSms } from '../../../utils/phoneNormalize'
import type {
  CampaignDeliveryStatus,
  CampaignRecipientCandidate,
  CampaignRunRow,
  CampaignTemplateRow,
} from '../types'
import { CampaignSegmentService } from './campaignSegmentService'
import { CampaignService } from './campaignService'
import { CampaignTemplateService } from './campaignTemplateService'

type LoadedRun = CampaignRunRow & {
  campaign_name: string
  channel: 'email' | 'sms' | 'telegram'
  template_id: number
  segment_id: number
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function buildMessage(template: CampaignTemplateRow, vars: Record<string, string>) {
  return {
    subject: template.subject_template ? renderEmailTemplate(template.subject_template, vars) : '',
    text: renderEmailTemplate(template.body_template, vars),
    html: template.body_html_template ? renderEmailTemplate(template.body_html_template, vars) : null,
  }
}

export class CampaignDispatchService {
  static async dispatchRun(runId: number, options?: { testDestinations?: string[]; testMessage?: string }): Promise<void> {
    const run = (await CampaignService.getRunById(runId)) as LoadedRun | null
    if (!run) throw new Error('Запуск кампании не найден')
    const campaign = await CampaignService.getById(run.campaign_id)
    if (!campaign) throw new Error('Кампания не найдена')
    const template = await CampaignTemplateService.getById(run.template_id)
    if (!template) throw new Error('Шаблон кампании не найден')

    await CampaignService.updateRunStatus(runId, 'running')
    await CampaignService.setCampaignStatus(run.campaign_id, 'running')

    try {
      const recipients = await this.getRecipientsForRun(run, options)
      for (const recipient of recipients) {
        if (await this.isCancelled(runId)) break
        await this.dispatchRecipient(run, template, recipient, campaign?.settings || {}, options)
      }
      const stats = await this.recalculateRunStats(runId)
      const finalStatus = (await this.isCancelled(runId)) ? 'cancelled' : stats.failed > 0 && stats.sent === 0 ? 'failed' : 'completed'
      await CampaignService.updateRunStatus(runId, finalStatus, {
        statsJson: JSON.stringify(stats),
        finished: true,
      })
      await CampaignService.setCampaignStatus(run.campaign_id, finalStatus === 'cancelled' ? 'cancelled' : 'completed')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      await CampaignService.updateRunStatus(runId, 'failed', {
        statsJson: JSON.stringify(await this.recalculateRunStats(runId)),
        errorText: msg,
        finished: true,
      })
      await CampaignService.setCampaignStatus(run.campaign_id, 'failed')
      throw error
    }
  }

  static async cancelRun(runId: number): Promise<void> {
    await CampaignService.updateRunStatus(runId, 'cancelled', { finished: true })
  }

  static async getRunRecipients(runId: number): Promise<any[]> {
    const db = await getDb()
    const rows = await db.all<any[]>(
      `SELECT r.*, m.status as mail_status, m.first_opened_at, m.bounce_noted_at
       FROM campaign_run_recipients r
       LEFT JOIN mail_jobs m ON m.id = r.mail_job_id
       WHERE r.run_id = ?
       ORDER BY r.id ASC`,
      [runId]
    )
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      ...row,
      effective_status: this.resolveEffectiveStatus(row),
      payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    }))
  }

  static async recalculateRunStats(runId: number): Promise<Record<string, number>> {
    const recipients = await this.getRunRecipients(runId)
    const stats = {
      total: recipients.length,
      queued: 0,
      sent: 0,
      delivered: 0,
      opened: 0,
      failed: 0,
      skipped: 0,
      unsubscribed: 0,
      cancelled: 0,
    }
    recipients.forEach((row) => {
      const key = String(row.effective_status || 'queued') as keyof typeof stats
      if (key in stats) stats[key] += 1
    })
    return stats
  }

  private static async getRecipientsForRun(run: LoadedRun, options?: { testDestinations?: string[]; testMessage?: string }): Promise<CampaignRecipientCandidate[]> {
    if (run.mode === 'test') {
      const unique = Array.from(new Set((options?.testDestinations || []).map((x) => String(x || '').trim()).filter(Boolean)))
      return unique.map((destination, idx) => ({
        channel: run.channel,
        destination,
        displayName: `Тест ${idx + 1}`,
        email: run.channel === 'email' ? destination : undefined,
        phone: run.channel === 'sms' ? destination : undefined,
      }))
    }
    const campaign = await CampaignService.getById(run.campaign_id)
    const segment = await CampaignSegmentService.getById(Number(campaign?.segment_id))
    if (!segment) throw new Error('Сегмент кампании не найден')
    return CampaignSegmentService.resolveRecipients(segment, run.channel)
  }

  private static async dispatchRecipient(run: LoadedRun, template: CampaignTemplateRow, recipient: CampaignRecipientCandidate, settings: Record<string, unknown>, options?: { testMessage?: string }): Promise<void> {
    const db = await getDb()
    const baseVars = CampaignSegmentService.buildRecipientVars(recipient)
    const vars = {
      ...baseVars,
      subject: options?.testMessage || String(settings.subject || run.campaign_name || ''),
      message: options?.testMessage || String(settings.message || ''),
    }
    const built = buildMessage(template, vars)
    const insert = await db.run(
      `INSERT INTO campaign_run_recipients
       (run_id, customer_id, telegram_user_id, destination, payload_json, delivery_status, updated_at)
       VALUES (?, ?, ?, ?, ?, 'queued', datetime('now'))`,
      [
        run.id,
        recipient.customerId ?? null,
        recipient.telegramUserId ?? null,
        recipient.destination,
        JSON.stringify({ vars }),
      ]
    )
    const recipientId = Number(insert.lastID)
    if (run.channel === 'email') {
      const subject = built.subject || `${run.campaign_name}`
      const html = built.html || `<p>${built.text}</p>`
      const res = await enqueueMail({
        to: recipient.destination,
        subject,
        html,
        text: built.text,
        jobType: 'marketing',
        idempotencyKey: `campaign:${run.id}:recipient:${recipientId}`,
        payload: { campaignRunId: run.id, campaignRecipientId: recipientId },
        maxAttempts: 3,
      })
      await db.run(
        `UPDATE campaign_run_recipients
         SET mail_job_id = ?, provider_message_id = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [res.id, `mail-job:${res.id}`, recipientId]
      )
      return
    }
    if (run.channel === 'sms') {
      const phone = normalizePhoneForSms(recipient.destination)
      let errorText: string | null = null
      let smsLogId: number | null = null
      try {
        if (!phone) throw new Error('Некорректный номер телефона')
        await sendSmsThroughProvider({ to: phone, text: built.text })
        const log = await db.run(
          `INSERT INTO sms_log (order_id, phone, body, channel, target_status_id, idempotency_key, error)
           VALUES (NULL, ?, ?, 'manual', NULL, ?, NULL)`,
          [phone, built.text, `campaign-sms:${run.id}:${recipientId}`]
        )
        smsLogId = Number(log.lastID)
        await db.run(
          `UPDATE campaign_run_recipients
           SET delivery_status = 'sent', sms_log_id = ?, provider_message_id = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [smsLogId, `sms-log:${smsLogId}`, recipientId]
        )
      } catch (e) {
        errorText = e instanceof Error ? e.message : String(e)
        await db.run(
          `UPDATE campaign_run_recipients
           SET delivery_status = 'failed', error_text = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [errorText, recipientId]
        )
      }
      return
    }
    const ok = await TelegramService.sendMessageToUser(recipient.destination, built.text)
    await db.run(
      `UPDATE campaign_run_recipients
       SET delivery_status = ?, provider_message_id = ?, error_text = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [ok ? 'sent' : 'failed', `telegram:${recipient.destination}`, ok ? null : 'Telegram API error', recipientId]
    )
  }

  private static resolveEffectiveStatus(row: any): CampaignDeliveryStatus {
    if (row.first_opened_at) return 'opened'
    if (row.delivery_status === 'failed') return 'failed'
    if (row.delivery_status === 'cancelled') return 'cancelled'
    if (row.mail_status === 'failed') return 'failed'
    if (row.mail_status === 'sent') return 'sent'
    if (row.mail_status === 'sending' || row.mail_status === 'pending') return 'queued'
    return (row.delivery_status || 'queued') as CampaignDeliveryStatus
  }

  private static async isCancelled(runId: number): Promise<boolean> {
    const run = await CampaignService.getRunById(runId)
    return !run || run.status === 'cancelled'
  }
}
