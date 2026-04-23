import { isSmsEnabled, getSmsWorkerIntervalMs } from '../config/sms'
import { processSmsDebounceQueue } from './orderStatusSmsService'
import { logger } from '../utils/logger'

let timer: ReturnType<typeof setInterval> | null = null

export function startSmsDebounceWorker(): void {
  if (timer) {
    return
  }
  if (!isSmsEnabled()) {
    logger.info('SMS debounce worker disabled (SMS_ENABLED!=true)')
    return
  }
  const interval = getSmsWorkerIntervalMs()
  void processSmsDebounceQueue(20)
  timer = setInterval(() => {
    void processSmsDebounceQueue(20)
  }, interval)
  logger.info('SMS debounce worker started', { intervalMs: interval })
}
