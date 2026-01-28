/**
 * Универсальный кеш для статических данных из БД
 * 
 * Используется для кеширования редко изменяющихся данных:
 * - Категории продуктов, материалов
 * - Статусы заказов
 * - Типы бумаги
 * - Активные операции/услуги
 * - Пресеты
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 минут по умолчанию

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

const cache = new Map<string, CacheEntry<any>>()

/**
 * Получить данные из кеша или выполнить загрузку
 * 
 * @param key - уникальный ключ кеша
 * @param loader - функция для загрузки данных из БД
 * @param ttl - время жизни кеша в миллисекундах (по умолчанию 5 минут)
 * @param force - принудительно обновить кеш
 */
export async function getCachedData<T>(
  key: string,
  loader: () => Promise<T>,
  ttl: number = DEFAULT_TTL_MS,
  force: boolean = false
): Promise<T> {
  const now = Date.now()
  const entry = cache.get(key)

  // Проверяем валидность кеша
  if (!force && entry && (now - entry.timestamp) < entry.ttl) {
    return entry.data
  }

  // Загружаем данные
  const data = await loader()

  // Сохраняем в кеш
  cache.set(key, {
    data,
    timestamp: now,
    ttl,
  })

  return data
}

/**
 * Инвалидировать кеш по ключу
 */
export function invalidateCache(key: string): void {
  cache.delete(key)
}

/**
 * Инвалидировать все кеши
 */
export function clearCache(): void {
  cache.clear()
}

/**
 * Инвалидировать все кеши, содержащие указанную подстроку в ключе
 * Полезно для инвалидации связанных данных (например, все категории)
 */
export function invalidateCacheByPattern(pattern: string): void {
  const keysToDelete: string[] = []
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      keysToDelete.push(key)
    }
  }
  for (const key of keysToDelete) {
    cache.delete(key)
  }
}

/**
 * Получить статистику кеша (для отладки)
 */
export function getCacheStats(): {
  size: number
  keys: string[]
  entries: Array<{ key: string; age: number; ttl: number }>
} {
  const now = Date.now()
  const entries: Array<{ key: string; age: number; ttl: number }> = []

  for (const [key, entry] of cache.entries()) {
    entries.push({
      key,
      age: now - entry.timestamp,
      ttl: entry.ttl,
    })
  }

  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
    entries,
  }
}
