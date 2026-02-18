/**
 * Мониторинг заполненности хранилища.
 * Отправляет уведомление, когда диск заполнен на 80% и более.
 */

import { TelegramService } from './telegramService'
import { logger } from '../utils/logger'
import { uploadsDir } from '../config/upload'

const THRESHOLD_PERCENT = 80
const THROTTLE_MS = 24 * 60 * 60 * 1000 // Не чаще раза в 24 часа

let lastNotificationAt = 0
let wasOverThreshold = false

/**
 * Получает процент заполнения диска (0–100).
 */
async function getDiskUsagePercent(checkPath: string): Promise<number | null> {
  try {
    const checkDiskSpace = (await import('check-disk-space')).default
    const space = await checkDiskSpace(checkPath)
    const used = space.size - space.free
    return space.size > 0 ? Math.round((used / space.size) * 100) : 0
  } catch (err: any) {
    logger.warn('StorageMonitor: не удалось получить использование диска', { error: err?.message })
    return null
  }
}

/**
 * Проверяет заполненность и отправляет уведомление при >= 80%.
 */
export async function checkStorageAndNotify(): Promise<void> {
  const checkPath = uploadsDir || process.cwd()
  const usedPercent = await getDiskUsagePercent(checkPath)

  if (usedPercent === null) return

  const overThreshold = usedPercent >= THRESHOLD_PERCENT

  if (overThreshold) {
    const now = Date.now()
    const shouldNotify =
      !wasOverThreshold || (wasOverThreshold && now - lastNotificationAt > THROTTLE_MS)

    if (shouldNotify && TelegramService.isEnabled()) {
      const message = `Заполнено ${usedPercent}% хранилища (порог: ${THRESHOLD_PERCENT}%)\n\nПуть: ${checkPath}\n\nРекомендуется освободить место.`
      const sent = await TelegramService.sendNotification(
        '⚠️ Хранилище почти заполнено',
        message,
        'high'
      )
      if (sent) {
        lastNotificationAt = now
        logger.info('StorageMonitor: отправлено уведомление о заполнении хранилища', {
          usedPercent,
          path: checkPath,
        })
      }
    }
    wasOverThreshold = true
  } else {
    wasOverThreshold = false
  }
}

let checkInterval: NodeJS.Timeout | null = null

export interface StorageMonitorConfig {
  enabled: boolean
  /** Интервал проверки в миллисекундах (по умолчанию 1 час) */
  intervalMs: number
}

/**
 * Запускает периодическую проверку хранилища.
 */
export function startStorageMonitor(config: StorageMonitorConfig): void {
  if (!config.enabled) {
    logger.info('StorageMonitor: отключён')
    return
  }

  const run = () => {
    checkStorageAndNotify().catch((err) => {
      logger.error('StorageMonitor: ошибка', { error: err?.message })
    })
  }

  run()
  checkInterval = setInterval(run, config.intervalMs)
  logger.info('StorageMonitor: включён', {
    intervalMinutes: config.intervalMs / (60 * 1000),
    thresholdPercent: THRESHOLD_PERCENT,
  })
}

/**
 * Останавливает мониторинг.
 */
export function stopStorageMonitor(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
    logger.info('StorageMonitor: остановлен')
  }
}
