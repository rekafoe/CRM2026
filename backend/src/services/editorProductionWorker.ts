import { logger } from '../utils/logger'
import { processEditorProductionJobBatch } from './editorProductionJobService'

let timer: ReturnType<typeof setInterval> | null = null

export function isEditorProductionWorkerEnabled(): boolean {
  const raw = String(process.env.EDITOR_PRODUCTION_WORKER_ENABLED ?? 'true').trim().toLowerCase()
  return raw !== 'false' && raw !== '0'
}

function getIntervalMs(): number {
  const n = Number(process.env.EDITOR_PRODUCTION_WORKER_INTERVAL_MS ?? 15000)
  return Number.isFinite(n) && n >= 3000 ? n : 15000
}

export function startEditorProductionWorker(): void {
  if (timer) return
  if (!isEditorProductionWorkerEnabled()) {
    logger.info('Editor production worker disabled (EDITOR_PRODUCTION_WORKER_ENABLED=false)')
    return
  }

  const interval = getIntervalMs()
  void processEditorProductionJobBatch(3)
  timer = setInterval(() => {
    void processEditorProductionJobBatch(3)
  }, interval)

  logger.info('Editor production worker started', { intervalMs: interval })
}

export function stopEditorProductionWorkerForTests(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
