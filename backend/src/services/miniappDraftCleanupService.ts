import { getDb } from '../config/database'
import { logger } from '../utils/logger'
import { MINIAPP_CHECKOUT_STATE_DRAFT } from '../utils/miniappCheckoutState'

const DEFAULT_RETENTION_HOURS = 72
let timer: NodeJS.Timeout | null = null

function normalizeRetentionHours(value: unknown): number {
  const hours = Number(value)
  if (!Number.isInteger(hours) || hours < 1 || hours > 24 * 365) return DEFAULT_RETENTION_HOURS
  return hours
}

export async function expireOldMiniappDrafts(options?: { retentionHours?: number }): Promise<{ expired: number }> {
  const retentionHours = normalizeRetentionHours(options?.retentionHours ?? process.env.MINIAPP_DRAFT_RETENTION_HOURS)
  const db = await getDb()
  const result = await db.run(
    `UPDATE orders
     SET miniapp_expired_at = datetime('now')
     WHERE source = 'mini_app'
       AND miniapp_checkout_state = ?
       AND miniapp_expired_at IS NULL
       AND datetime(COALESCE(createdAt, created_at)) < datetime('now', ?)`,
    [MINIAPP_CHECKOUT_STATE_DRAFT, `-${retentionHours} hours`],
  )
  const expired = Number(result.changes || 0)
  if (expired > 0) logger.info('Mini App drafts expired', { expired, retentionHours })
  return { expired }
}

export function startMiniappDraftCleanup(config: { enabled: boolean; intervalMs: number; retentionHours?: number }): void {
  if (!config.enabled || timer) return
  const run = () => {
    void expireOldMiniappDrafts({ retentionHours: config.retentionHours }).catch((error) => {
      logger.error('Mini App draft cleanup failed', { error: (error as Error)?.message })
    })
  }
  run()
  timer = setInterval(run, Math.max(60_000, config.intervalMs))
  timer.unref?.()
  logger.info('Mini App draft cleanup started', {
    intervalMs: Math.max(60_000, config.intervalMs),
    retentionHours: normalizeRetentionHours(config.retentionHours ?? process.env.MINIAPP_DRAFT_RETENTION_HOURS),
  })
}

export function stopMiniappDraftCleanup(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
