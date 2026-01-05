import { Request, Response, NextFunction } from 'express'

interface RateLimitOptions {
  windowMs: number // Временное окно в миллисекундах
  max: number // Максимальное количество запросов
  message?: string
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

class RateLimiter {
  private requests = new Map<string, RateLimitEntry>()
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Очистка устаревших записей каждые 5 минут
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 5 * 60 * 1000)
  }

  middleware(options: RateLimitOptions) {
    const {
      windowMs,
      max,
      message = 'Too many requests, please try again later',
      skipSuccessfulRequests = false,
      skipFailedRequests = false
    } = options

    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.getKey(req)
      const now = Date.now()
      
      // Получаем или создаем запись для этого ключа
      let entry = this.requests.get(key)
      
      if (!entry || now > entry.resetTime) {
        // Создаем новую запись
        entry = {
          count: 0,
          resetTime: now + windowMs
        }
        this.requests.set(key, entry)
      }

      // Увеличиваем счетчик
      entry.count++

      // Проверяем лимит
      if (entry.count > max) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
        
        res.set({
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': max.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(entry.resetTime).toISOString()
        })

        return res.status(429).json({
          error: message,
          retryAfter,
          limit: max,
          remaining: 0,
          resetTime: new Date(entry.resetTime).toISOString()
        })
      }

      // Устанавливаем заголовки
      res.set({
        'X-RateLimit-Limit': max.toString(),
        'X-RateLimit-Remaining': Math.max(0, max - entry.count).toString(),
        'X-RateLimit-Reset': new Date(entry.resetTime).toISOString()
      })

      // Переопределяем res.json для отслеживания успешных/неуспешных запросов
      const originalJson = res.json.bind(res)
      const originalSend = res.send.bind(res)

      res.json = function(data: any) {
        if (skipSuccessfulRequests && res.statusCode >= 200 && res.statusCode < 300) {
          entry!.count = Math.max(0, entry!.count - 1)
        }
        return originalJson(data)
      }

      res.send = function(data: any) {
        if (skipSuccessfulRequests && res.statusCode >= 200 && res.statusCode < 300) {
          entry!.count = Math.max(0, entry!.count - 1)
        }
        return originalSend(data)
      }

      next()
    }
  }

  private getKey(req: Request): string {
    // Используем IP адрес как ключ
    const ip = req.ip || req.connection.remoteAddress || 'unknown'
    return `rate_limit:${ip}`
  }

  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this.requests.entries()) {
      if (now > entry.resetTime) {
        this.requests.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`Rate limiter cleanup: removed ${cleaned} expired entries`)
    }
  }

  // Получение статистики
  getStats() {
    const now = Date.now()
    let active = 0
    let expired = 0

    for (const entry of this.requests.values()) {
      if (now > entry.resetTime) {
        expired++
      } else {
        active++
      }
    }

    return {
      active,
      expired,
      total: this.requests.size
    }
  }

  // Очистка при завершении приложения
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.requests.clear()
  }
}

// Создаем глобальный экземпляр
const rateLimiter = new RateLimiter()

// Предустановленные лимиты для разных типов запросов (из env или дефолты)
export const generalRateLimit = rateLimiter.middleware({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || 100),
  message: 'Too many requests from this IP, please try again later'
})

export const strictRateLimit = rateLimiter.middleware({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 20, // 20 запросов за 15 минут
  message: 'Rate limit exceeded for this endpoint'
})

export const authRateLimit = rateLimiter.middleware({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // 5 попыток входа за 15 минут
  message: 'Too many authentication attempts, please try again later'
})

export const apiRateLimit = rateLimiter.middleware({
  windowMs: 1 * 60 * 1000, // 1 минута
  max: 60, // 60 запросов в минуту
  message: 'API rate limit exceeded'
})

export { rateLimiter }
