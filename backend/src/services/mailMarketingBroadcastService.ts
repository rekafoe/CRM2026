import { getDb } from '../config/database'
import { renderEmailTemplate } from './emailTemplateService'
import { enqueueMail } from './mailOutboxService'
import {
  listMarketingOptInRecipients,
  buildUnsubscribeUrl,
  DAY_KEY,
} from './customerEmailMarketingService'
import { logger } from '../utils/logger'

function displayName(r: {
  type: 'individual' | 'legal'
  first_name: string | null
  last_name: string | null
  company_name: string | null
}): string {
  if (r.type === 'legal') {
    return (r.company_name || 'Клиент').trim()
  }
  const p = [r.last_name, r.first_name].filter(Boolean).join(' ').trim()
  return p || 'Клиент'
}

const DEFAULT_MAX = 500

/**
 * Поставить в очередь маркетинговую рассылку по существующему шаблону email_templates.
 * Плейсхолдеры: {{customerName}}, {{unsubscribeUrl}}, {{first_name}}, {{company_name}}
 */
export async function enqueueMarketingTemplateBroadcast(
  templateId: number
): Promise<{ enqueued: number; skipped: number; templateSlug?: string }> {
  const max = (() => {
    const n = Number(process.env.MAIL_MARKETING_BROADCAST_MAX)
    if (Number.isFinite(n) && n > 0) return Math.min(10_000, n)
    return DEFAULT_MAX
  })()

  const db = await getDb()
  const tpl = await db.get<{
    id: number
    slug: string
    subject_template: string
    body_html_template: string
    body_text_template: string | null
    is_active: number
  }>(
    'SELECT id, slug, subject_template, body_html_template, body_text_template, is_active FROM email_templates WHERE id = ?',
    [templateId]
  )
  if (!tpl) {
    throw new Error('Шаблон не найден')
  }
  if (tpl.is_active !== 1) {
    throw new Error('Шаблон неактивен')
  }

  const recipients = await listMarketingOptInRecipients(max)
  let enqueued = 0
  let skipped = 0
  const day = DAY_KEY()

  for (const r of recipients) {
    const vars: Record<string, string> = {
      customerName: displayName(r),
      first_name: (r.first_name || '').trim(),
      company_name: (r.company_name || '').trim(),
      unsubscribeUrl: buildUnsubscribeUrl(r.unsubscribe_token),
    }
    const subject = renderEmailTemplate(tpl.subject_template, vars)
    const html = renderEmailTemplate(tpl.body_html_template, vars)
    const text = tpl.body_text_template
      ? renderEmailTemplate(tpl.body_text_template, vars)
      : undefined

    const idempotencyKey = `mkt:broadcast:${templateId}:cust:${r.id}:day:${day}`

    try {
      const res = await enqueueMail({
        to: r.email.trim(),
        subject,
        html,
        text,
        jobType: 'marketing',
        idempotencyKey,
        maxAttempts: 3,
        payload: { customerId: r.id, templateId, templateSlug: tpl.slug, broadcastDay: day },
      })
      if (res.duplicate) skipped += 1
      else enqueued += 1
    } catch (e) {
      logger.warn('Marketing enqueue row failed', { email: r.email, error: e })
      skipped += 1
    }
  }

  logger.info('Marketing broadcast enqueued', { templateId, enqueued, skipped, cap: max })
  return { enqueued, skipped, templateSlug: tpl.slug }
}
