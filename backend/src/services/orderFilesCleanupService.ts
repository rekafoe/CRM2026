/**
 * Автоматическая очистка файлов клиентов (order_files).
 * Удаляет файлы старше 1.5 недели (10.5 дней).
 */

import path from 'path'
import fs from 'fs'
import { getDb } from '../config/database'
import { uploadsDir } from '../config/upload'
import { logger } from '../utils/logger'

/** 1.5 недели в часах для SQLite datetime */
const RETENTION_HOURS = 10.5 * 24 // 252 часа

let cleanupInterval: NodeJS.Timeout | null = null

export interface OrderFilesCleanupConfig {
  enabled: boolean
  /** Интервал запуска в миллисекундах (по умолчанию 24 часа) */
  intervalMs: number
}

/**
 * Удаляет файлы клиентов старше 1.5 недели.
 * @returns { deletedFiles: number, deletedRecords: number }
 */
export async function cleanupOldOrderFiles(): Promise<{ deletedFiles: number; deletedRecords: number }> {
  const db = await getDb()
  // SQLite: datetime('now', '-252 hours') = 10.5 дней назад
  const rows = await db.all<{ id: number; orderId: number; filename: string }>(
    `SELECT id, orderId, filename FROM order_files WHERE datetime(uploadedAt) < datetime('now', '-${RETENTION_HOURS} hours')`
  )

  let deletedFiles = 0
  let deletedRecords = 0

  for (const row of rows || []) {
    const filePath = path.join(uploadsDir, String(row.filename))
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
        deletedFiles++
      } catch (err: any) {
        logger.warn('OrderFilesCleanup: не удалось удалить файл', { path: filePath, error: err?.message })
      }
    }
    try {
      await db.run('DELETE FROM order_files WHERE id = ? AND orderId = ?', row.id, row.orderId)
      deletedRecords++
    } catch (err: any) {
      logger.warn('OrderFilesCleanup: не удалось удалить запись', { id: row.id, error: err?.message })
    }
  }

  if (deletedRecords > 0) {
    logger.info('OrderFilesCleanup: удалено файлов клиентов', {
      deletedFiles,
      deletedRecords,
    })
  }

  return { deletedFiles, deletedRecords }
}

/**
 * Запускает периодическую очистку.
 */
export function startOrderFilesCleanup(config: OrderFilesCleanupConfig): void {
  if (!config.enabled) {
    logger.info('OrderFilesCleanup: отключён')
    return
  }

  const run = () => {
    cleanupOldOrderFiles().catch((err) => {
      logger.error('OrderFilesCleanup: ошибка', { error: err?.message })
    })
  }

  run()
  cleanupInterval = setInterval(run, config.intervalMs)
  logger.info('OrderFilesCleanup: включён', {
    intervalHours: config.intervalMs / (60 * 60 * 1000),
    retentionDays: RETENTION_HOURS / 24,
  })
}

/**
 * Останавливает периодическую очистку.
 */
export function stopOrderFilesCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
    logger.info('OrderFilesCleanup: остановлен')
  }
}
