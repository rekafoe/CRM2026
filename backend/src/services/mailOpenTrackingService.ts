import { getDb } from '../config/database'
import { logger } from '../utils/logger'

/** 1×1 прозрачный GIF (минимум байт). */
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

export function getTrackingPixelResponse(): { body: Buffer; contentType: string } {
  return { body: PIXEL, contentType: 'image/gif' }
}

/**
 * Первое открытие: выставляем first_opened_at, если токен известен.
 */
export async function recordMailOpenByToken(token: string): Promise<boolean> {
  const t = (token || '').trim()
  if (t.length < 16) return false
  const db = await getDb()
  const r = await db.run(
    `UPDATE mail_jobs
     SET first_opened_at = COALESCE(first_opened_at, datetime('now')),
         updated_at = datetime('now')
     WHERE open_token = ? AND job_type = 'marketing'`,
    [t]
  )
  const n = (r as { changes?: number })?.changes ?? 0
  if (n > 0) {
    logger.debug('Mail open tracked', { tokenPrefix: t.slice(0, 8) + '…' })
  }
  return n > 0
}
