import { Request, Response, NextFunction } from 'express'

interface CacheOptions {
  maxAge?: number // В секундах
  mustRevalidate?: boolean
  private?: boolean
  noStore?: boolean
}

export function httpCacheMiddleware(options: CacheOptions = {}) {
  const {
    maxAge = 300, // 5 минут по умолчанию
    mustRevalidate = false,
    private: isPrivate = false,
    noStore = false
  } = options

  return (req: Request, res: Response, next: NextFunction) => {
    // Не кэшируем POST, PUT, DELETE запросы
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      return next()
    }

    // Настраиваем заголовки кэширования
    if (noStore) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
    } else {
      const cacheControl = [
        isPrivate ? 'private' : 'public',
        `max-age=${maxAge}`,
        mustRevalidate ? 'must-revalidate' : ''
      ].filter(Boolean).join(', ')

      res.setHeader('Cache-Control', cacheControl)
      res.setHeader('Expires', new Date(Date.now() + maxAge * 1000).toUTCString())
    }

    // Добавляем ETag для валидации кэша
    res.setHeader('ETag', `"${Date.now()}-${Math.random().toString(36).substr(2, 9)}"`)

    next()
  }
}

// Предустановленные настройки кэширования
export const cachePresets = {
  // Статические данные (статусы, пользователи) - кэшируем на 15 минут
  static: httpCacheMiddleware({ maxAge: 900, mustRevalidate: true }),
  
  // Динамические данные (заказы, материалы) - кэшируем на 2 минуты
  dynamic: httpCacheMiddleware({ maxAge: 120, mustRevalidate: true }),
  
  // Отчеты - кэшируем на 5 минут
  reports: httpCacheMiddleware({ maxAge: 300, mustRevalidate: true }),
  
  // Поиск - кэшируем на 1 минуту
  search: httpCacheMiddleware({ maxAge: 60, mustRevalidate: true }),
  
  // Не кэшируем
  noCache: httpCacheMiddleware({ noStore: true })
}

