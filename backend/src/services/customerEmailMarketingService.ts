import { getDb } from '../config/database'
import { logger } from '../utils/logger'

const DAY_KEY = () => new Date().toISOString().slice(0, 10)

/**
 * Публичный базовый URL API (для ссылок «отписаться» в письмах).
 * Задать в production: PUBLIC_API_BASE_URL=https://api.example.com
 */
export function getPublicApiBaseUrl(): string {
  const u = String(process.env.PUBLIC_API_BASE_URL || '').trim()
  if (u) return u.replace(/\/$/, '')
  return ''
}

export function buildUnsubscribeUrl(unsubscribeToken: string): string {
  const base = getPublicApiBaseUrl()
  if (!base) {
    return `/api/mail/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
  }
  return `${base}/api/mail/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
}

export interface MarketingRecipientRow {
  id: number
  email: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  type: 'individual' | 'legal'
  unsubscribe_token: string
}

/**
 * Сегмент «рассылка»: есть email, согласие, не отписан, есть токен.
 */
export async function listMarketingOptInRecipients(limit: number): Promise<MarketingRecipientRow[]> {
  const lim = Math.min(10_000, Math.max(1, limit))
  const db = await getDb()
  const rows = (await db.all(
    `SELECT id, email, first_name, last_name, company_name, type, unsubscribe_token
     FROM customers
     WHERE email IS NOT NULL
       AND trim(email) != ''
       AND marketing_opt_in = 1
       AND (email_unsubscribed_at IS NULL)
       AND unsubscribe_token IS NOT NULL
       AND trim(unsubscribe_token) != ''
     ORDER BY id
     LIMIT ?`,
    [lim]
  )) as MarketingRecipientRow[]
  return Array.isArray(rows) ? rows : []
}

export async function countMarketingOptIn(): Promise<number> {
  const db = await getDb()
  const r = await db.get<{ c: number }>(
    `SELECT COUNT(1) as c FROM customers
     WHERE email IS NOT NULL AND trim(email) != ''
       AND marketing_opt_in = 1
       AND (email_unsubscribed_at IS NULL)
       AND unsubscribe_token IS NOT NULL
       AND trim(unsubscribe_token) != ''`
  )
  return Number(r?.c ?? 0)
}

/**
 * One-click отписка по токену. Идемпотентно.
 */
export async function unsubscribeByToken(token: string): Promise<{ ok: boolean; error?: string }> {
  const t = (token || '').trim()
  if (t.length < 16) {
    return { ok: false, error: 'Invalid token' }
  }
  const db = await getDb()
  const now = new Date().toISOString()
  const r = await db.run(
    `UPDATE customers
     SET marketing_opt_in = 0,
         email_unsubscribed_at = COALESCE(email_unsubscribed_at, ?),
         updated_at = ?
     WHERE unsubscribe_token = ?`,
    [now, now, t]
  )
  const changes = (r as { changes?: number })?.changes ?? 0
  if (changes < 1) {
    return { ok: false, error: 'Unknown token' }
  }
  logger.info('Customer unsubscribed from marketing', { tokenPrefix: t.slice(0, 6) + '…' })
  return { ok: true }
}

export { DAY_KEY }
