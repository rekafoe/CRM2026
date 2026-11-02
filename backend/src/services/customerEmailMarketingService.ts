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
export type AccountMailingStatus = 'subscribed' | 'unsubscribed' | 'absent';

function normalizeMail(email: string): string {
  return email.trim().toLowerCase();
}

export async function readEmailConsent(email: string): Promise<boolean | null> {
  const mail = normalizeMail(email);
  if (!mail) return null;
  const db = await getDb();
  const row = await db.get<{ opted_in: number }>(
    'SELECT opted_in FROM marketing_email_consents WHERE email = ?',
    [mail]
  );
  if (!row) return null;
  return Number(row.opted_in) === 1;
}

export async function upsertEmailConsent(email: string, subscribed: boolean): Promise<void> {
  const mail = normalizeMail(email);
  if (!mail) return;
  const db = await getDb();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO marketing_email_consents (email, opted_in, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET opted_in = excluded.opted_in, updated_at = excluded.updated_at`,
    [mail, subscribed ? 1 : 0, now]
  );
}

export async function accountMailingStatus(email: string): Promise<AccountMailingStatus> {
  const mail = normalizeMail(email);
  if (!mail) return 'absent';
  const db = await getDb();
  const row = await db.get<{ total: number; subscribed: number }>(
    `SELECT COUNT(1) as total,
            SUM(CASE WHEN marketing_opt_in = 1 AND email_unsubscribed_at IS NULL THEN 1 ELSE 0 END) as subscribed
     FROM customers
     WHERE lower(trim(email)) = ?`,
    [mail]
  );
  const total = Number(row?.total ?? 0);
  if (total > 0) return Number(row?.subscribed ?? 0) > 0 ? 'subscribed' : 'unsubscribed';
  const consent = await readEmailConsent(mail);
  if (consent === null) return 'absent';
  return consent ? 'subscribed' : 'unsubscribed';
}

export async function setAccountMailing(email: string, subscribed: boolean): Promise<AccountMailingStatus> {
  const mail = normalizeMail(email);
  if (!mail) return 'absent';
  await upsertEmailConsent(mail, subscribed);
  const db = await getDb();
  const now = new Date().toISOString();
  if (subscribed) {
    await db.run(
      `UPDATE customers
       SET marketing_opt_in = 1,
           email_unsubscribed_at = NULL,
           updated_at = ?
       WHERE lower(trim(email)) = ?`,
      [now, mail]
    );
    return 'subscribed';
  }
  await db.run(
    `UPDATE customers
     SET marketing_opt_in = 0,
         email_unsubscribed_at = COALESCE(email_unsubscribed_at, ?),
         updated_at = ?
     WHERE lower(trim(email)) = ?`,
    [now, now, mail]
  );
  return 'unsubscribed';
}

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
  const owner = await db.get<{ email: string | null }>(
    'SELECT email FROM customers WHERE unsubscribe_token = ?',
    [t]
  )
  if (owner?.email) await upsertEmailConsent(owner.email, false)
  logger.info('Customer unsubscribed from marketing', { tokenPrefix: t.slice(0, 6) + '…' })
  return { ok: true }
}

export { DAY_KEY }
