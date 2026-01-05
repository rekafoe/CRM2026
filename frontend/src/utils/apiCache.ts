/**
 * Простой кэш для API запросов
 * Кэширует результаты запросов на время жизни сессии
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTTL = 5 * 60 * 1000; // 5 минут по умолчанию

  /**
   * Получить данные из кэша
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.defaultTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Сохранить данные в кэш
   */
  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
    if (ttl) {
      this.defaultTTL = ttl;
    }
  }

  /**
   * Очистить кэш
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Удалить конкретный ключ из кэша
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Проверить, есть ли данные в кэше
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const age = Date.now() - entry.timestamp;
    if (age > this.defaultTTL) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }
}

// Экспортируем singleton
export const apiCache = new ApiCache();

