/**
 * Утилиты для кэширования данных продуктов
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class SimpleCache<T> {
  private cache: CacheEntry<T> | null = null;
  private duration: number;

  constructor(duration: number = 5 * 60 * 1000) {
    this.duration = duration;
  }

  get(): T | null {
    if (!this.cache) return null;
    
    const now = Date.now();
    if (now - this.cache.timestamp > this.duration) {
      this.cache = null;
      return null;
    }
    
    return this.cache.data;
  }

  set(data: T): void {
    this.cache = {
      data,
      timestamp: Date.now()
    };
  }

  clear(): void {
    this.cache = null;
  }

  isValid(): boolean {
    if (!this.cache) return false;
    return Date.now() - this.cache.timestamp <= this.duration;
  }
}

export class KeyedCache<T> {
  private cache: Record<string, CacheEntry<T>> = {};
  private duration: number;

  constructor(duration: number = 5 * 60 * 1000) {
    this.duration = duration;
  }

  get(key: string): T | null {
    const entry = this.cache[key];
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.timestamp > this.duration) {
      delete this.cache[key];
      return null;
    }
    
    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache[key] = {
      data,
      timestamp: Date.now()
    };
  }

  clear(key?: string): void {
    if (key) {
      delete this.cache[key];
    } else {
      this.cache = {};
    }
  }

  isValid(key: string): boolean {
    const entry = this.cache[key];
    if (!entry) return false;
    return Date.now() - entry.timestamp <= this.duration;
  }
}

