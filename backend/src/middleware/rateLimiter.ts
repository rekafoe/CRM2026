import { Request, Response, NextFunction } from 'express'
import { createHash } from 'crypto'

interface RateLimitOptions {
  windowMs: number // Временное окно в миллисекундах
  max: number // Максимальное количество запросов
  maxAuthenticated?: number // Отдельный лимит для авторизованных запросов
  message?: string
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
  keyPrefix?: string
  /** Не учитывать запрос в лимите (например GET статики картинок — иначе страница с N img даёт N «ударов» за одно открытие) */
  skip?: (req: Request) => boolean
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
      maxAuthenticated,
      message = 'Too many requests, please try again later',
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
      keyPrefix = 'global',
      skip,
    } = options

    return (req: Request, res: Response, next: NextFunction) => {
      // CORS preflight не должен учитываться в лимите: иначе 429 без CORS-заголовков ломает браузер
      if (req.method === 'OPTIONS') {
        return next()
      }
      if (skip?.(req)) {
        return next()
      }
      const bearerToken = this.extractBearerToken(req)
      const isAuthenticatedRequest = Boolean(bearerToken)
      const effectiveMax = isAuthenticatedRequest && Number.isFinite(Number(maxAuthenticated))
        ? Number(maxAuthenticated)
        : max
      const identity = isAuthenticatedRequest
        ? `auth:${this.hashIdentity(bearerToken!)}`
        : 'guest'
      const key = this.getKey(req, keyPrefix, identity)
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
      if (entry.count > effectiveMax) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
        
        res.set({
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': effectiveMax.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(entry.resetTime).toISOString()
        })

        return res.status(429).json({
          error: message,
          retryAfter,
          limit: effectiveMax,
          remaining: 0,
          resetTime: new Date(entry.resetTime).toISOString()
        })
      }

      // Устанавливаем заголовки
      res.set({
        'X-RateLimit-Limit': effectiveMax.toString(),
        'X-RateLimit-Remaining': Math.max(0, effectiveMax - entry.count).toString(),
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

  private getKey(req: Request, keyPrefix: string, identity: string): string {
    // Используем реальный клиентский IP за прокси (первый в X-Forwarded-For)
    const xffRaw = req.headers['x-forwarded-for']
    const xff = Array.isArray(xffRaw) ? xffRaw[0] : xffRaw
    const forwardedIp = typeof xff === 'string' ? xff.split(',')[0].trim() : ''
    const ip = forwardedIp || req.ip || req.connection.remoteAddress || 'unknown'
    return `rate_limit:${keyPrefix}:${identity}:${ip}`
  }

  private extractBearerToken(req: Request): string | null {
    const raw = req.headers.authorization
    if (!raw || typeof raw !== 'string') return null
    const m = raw.match(/^Bearer\s+(.+)$/i)
    if (!m) return null
    const token = m[1].trim()
    return token || null
  }

  private hashIdentity(token: string): string {
    return createHash('sha256').update(token).digest('hex').slice(0, 16)
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
/** GET/HEAD картинок из uploads — не считаем в общий лимит: одна страница = десятки параллельных img без Authorization */
function skipRateLimitForPublicUploadStatic(req: Request): boolean {
  const m = req.method
  if (m !== 'GET' && m !== 'HEAD') return false
  const p = ((req.originalUrl || req.url || '') as string).split('?')[0]
  if (p.startsWith('/api/uploads/')) return true
  // /uploads/* кроме заказов (orders/ режется отдельным middleware)
  if (p.startsWith('/uploads/') && !p.startsWith('/uploads/orders/')) return true
  return false
}

export const generalRateLimit = rateLimiter.middleware({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || 100),
  maxAuthenticated: Number(process.env.RATE_LIMIT_AUTH_MAX || 1000),
  message: 'Too many requests from this IP, please try again later',
  keyPrefix: 'general',
  skip: skipRateLimitForPublicUploadStatic,
})

export const strictRateLimit = rateLimiter.middleware({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 20, // 20 запросов за 15 минут
  message: 'Rate limit exceeded for this endpoint',
  keyPrefix: 'strict'
})

export const authRateLimit = rateLimiter.middleware({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // 5 попыток входа за 15 минут
  message: 'Too many authentication attempts, please try again later',
  keyPrefix: 'auth'
})

export const apiRateLimit = rateLimiter.middleware({
  windowMs: 1 * 60 * 1000, // 1 минута
  max: 60, // 60 запросов в минуту
  message: 'API rate limit exceeded',
  keyPrefix: 'api'
})

export { rateLimiter }
