interface CacheItem<T> {
  data: T
  timestamp: number
  ttl: number
}

export class CacheService {
  private cache = new Map<string, CacheItem<any>>()
  private maxSize = 1000 // Максимальное количество элементов в кэше
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Очистка устаревших элементов каждые 5 минут
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 5 * 60 * 1000)
  }

  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    // Если кэш переполнен, удаляем самые старые элементы
    if (this.cache.size >= this.maxSize) {
      this.evictOldest()
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key)
    
    if (!item) {
      return null
    }

    // Проверяем, не истек ли TTL
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key)
      return null
    }

    return item.data as T
  }

  has(key: string): boolean {
    const item = this.cache.get(key)
    
    if (!item) {
      return false
    }

    // Проверяем TTL
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  // Удаление элементов по паттерну
  deletePattern(pattern: string): number {
    let deleted = 0
    const regex = new RegExp(pattern)
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key)
        deleted++
      }
    }
    
    return deleted
  }

  // Получение статистики кэша
  getStats() {
    const now = Date.now()
    let validItems = 0
    let expiredItems = 0
    
    for (const item of this.cache.values()) {
      if (now - item.timestamp > item.ttl) {
        expiredItems++
      } else {
        validItems++
      }
    }
    
    return {
      total: this.cache.size,
      valid: validItems,
      expired: expiredItems,
      maxSize: this.maxSize
    }
  }

  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0
    
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key)
        cleaned++
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cache cleanup: removed ${cleaned} expired items`)
    }
  }

  private evictOldest(): void {
    let oldestKey = ''
    let oldestTime = Date.now()
    
    for (const [key, item] of this.cache.entries()) {
      if (item.timestamp < oldestTime) {
        oldestTime = item.timestamp
        oldestKey = key
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }

  // Генерация ключа кэша для API запросов
  static generateKey(method: string, path: string, query?: Record<string, any>): string {
    const queryString = query ? `?${new URLSearchParams(query).toString()}` : ''
    return `${method}:${path}${queryString}`
  }

  // Очистка кэша при завершении приложения
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.cache.clear()
  }
}

// Создаем глобальный экземпляр кэша
export const cacheService = new CacheService()