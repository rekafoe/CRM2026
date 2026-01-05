import { Request, Response, NextFunction } from 'express'
import { cacheService, CacheService } from '../services/cacheService'

interface CacheOptions {
  ttl?: number // Время жизни в миллисекундах
  keyGenerator?: (req: Request) => string
  skipCache?: (req: Request) => boolean
}

// Middleware для кэширования GET запросов
export const cacheMiddleware = (options: CacheOptions = {}) => {
  const {
    ttl = 5 * 60 * 1000, // 5 минут по умолчанию
    keyGenerator = (req) => CacheService.generateKey(req.method, req.path, req.query),
    skipCache = () => false
  } = options

  return (req: Request, res: Response, next: NextFunction) => {
    // Кэшируем только GET запросы
    if (req.method !== 'GET') {
      return next()
    }

    // Пропускаем кэширование если указано в опциях
    if (skipCache(req)) {
      return next()
    }

    const cacheKey = keyGenerator(req)
    
    // Проверяем кэш
    const cachedData = cacheService.get(cacheKey)
    
    if (cachedData) {
      console.log(`Cache hit: ${cacheKey}`)
      return res.json(cachedData)
    }

    // Сохраняем оригинальный res.json
    const originalJson = res.json.bind(res)
    
    // Переопределяем res.json для кэширования ответа
    res.json = function(data: any) {
      // Кэшируем только успешные ответы (статус 200)
      if (res.statusCode === 200) {
        cacheService.set(cacheKey, data, ttl)
        console.log(`Cache set: ${cacheKey}`)
      }
      
      return originalJson(data)
    }

    next()
  }
}

// Middleware для очистки кэша при изменениях
export const cacheInvalidation = (pattern: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Сохраняем оригинальный res.json
    const originalJson = res.json.bind(res)
    
    // Переопределяем res.json для очистки кэша
    res.json = function(data: any) {
      // Очищаем кэш только при успешных операциях
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const deleted = cacheService.deletePattern(pattern)
        if (deleted > 0) {
          console.log(`Cache invalidated: ${deleted} items matching pattern "${pattern}"`)
        }
      }
      
      return originalJson(data)
    }

    next()
  }
}

// Специфичные middleware для разных типов данных
export const ordersCache = cacheMiddleware({
  ttl: 2 * 60 * 1000, // 2 минуты для заказов
  skipCache: (req) => {
    // Не кэшируем если есть параметры фильтрации
    return Object.keys(req.query).length > 0
  }
})

export const materialsCache = cacheMiddleware({
  ttl: 10 * 60 * 1000, // 10 минут для материалов
})

export const usersCache = cacheMiddleware({
  ttl: 15 * 60 * 1000, // 15 минут для пользователей
})

// Middleware для очистки кэша заказов
export const ordersCacheInvalidation = cacheInvalidation('GET:/api/orders')

// Middleware для очистки кэша материалов
export const materialsCacheInvalidation = cacheInvalidation('GET:/api/materials')

// Middleware для очистки кэша пользователей
export const usersCacheInvalidation = cacheInvalidation('GET:/api/users')
