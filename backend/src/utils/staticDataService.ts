/**
 * Сервис для получения часто используемых статических данных с кешированием
 */

import { getDb } from '../config/database'
import { getCachedData } from './dataCache'

export interface ActiveOperation {
  id: number
  name: string
}

/**
 * Получить все активные операции (post_processing_services)
 */
export async function getActiveOperations(): Promise<ActiveOperation[]> {
  return getCachedData<ActiveOperation[]>(
    'post_processing_services_active',
    async () => {
      const db = await getDb()
      const rows = await db.all<ActiveOperation>(
        'SELECT id, name FROM post_processing_services WHERE is_active = 1 ORDER BY name'
      )
      return Array.isArray(rows) ? rows : []
    },
    5 * 60 * 1000 // 5 минут
  )
}

/**
 * Получить ID операции по имени (из кешированных активных)
 */
export async function getOperationIdByName(name: string): Promise<number | null> {
  const operations = await getActiveOperations()
  const operation = operations.find(op => op.name === name)
  return operation?.id ?? null
}
