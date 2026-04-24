import { getDb } from '../../../config/database'
import { logger } from '../../../utils/logger'
import { CampaignDispatchService } from './campaignDispatchService'
import { CampaignService } from './campaignService'

let timer: NodeJS.Timeout | null = null

async function processScheduledCampaigns(): Promise<void> {
  const db = await getDb()
  const rows = await db.all<Array<{ id: number }>>(
    `SELECT id
     FROM campaigns
     WHERE status = 'scheduled'
       AND scheduled_at IS NOT NULL
       AND scheduled_at <= datetime('now')
     ORDER BY scheduled_at ASC
     LIMIT 5`
  )
  for (const row of Array.isArray(rows) ? rows : []) {
    try {
      const run = await CampaignService.createRun(Number(row.id), 'live', null)
      await CampaignService.setCampaignStatus(Number(row.id), 'running')
      void CampaignDispatchService.dispatchRun(run.id).catch((error) => {
        logger.error('campaign worker dispatch failed', {
          campaignId: row.id,
          message: error instanceof Error ? error.message : String(error),
        })
      })
    } catch (error) {
      logger.error('campaign worker schedule failed', {
        campaignId: row.id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export function startCampaignWorker(): void {
  if (timer) return
  timer = setInterval(() => {
    void processScheduledCampaigns().catch((error) => {
      logger.error('campaign worker tick failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }, 15000)
  timer.unref?.()
  logger.info('Campaign worker started', { intervalMs: 15000 })
}
