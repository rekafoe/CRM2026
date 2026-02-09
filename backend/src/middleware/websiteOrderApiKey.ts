import { Request, Response, NextFunction } from 'express'

const API_KEY_HEADER = 'x-api-key'
const WEBSITE_ORDER_API_KEY = process.env.WEBSITE_ORDER_API_KEY || ''

function getProvidedKey(req: Request): string {
  const headerKey = (req.headers[API_KEY_HEADER] as string)?.trim()
  const auth = req.headers['authorization'] || ''
  const bearerKey = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  return headerKey || bearerKey || ''
}

export function isWebsiteOrderApiKeyValid(req: Request): boolean {
  if (!WEBSITE_ORDER_API_KEY || WEBSITE_ORDER_API_KEY.trim() === '') return false
  const providedKey = getProvidedKey(req)
  return !!providedKey && providedKey === WEBSITE_ORDER_API_KEY
}

/**
 * Проверка API-ключа для публичного эндпоинта создания заказов с сайта.
 * Ключ передаётся в заголовке X-API-Key или Authorization: Bearer <key>.
 * Если WEBSITE_ORDER_API_KEY не задан в env — возвращаем 503 (эндпоинт отключён).
 */
export function requireWebsiteOrderApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!WEBSITE_ORDER_API_KEY || WEBSITE_ORDER_API_KEY.trim() === '') {
    res.status(503).json({
      error: 'Website orders API is not configured',
      message: 'WEBSITE_ORDER_API_KEY is not set'
    })
    return
  }

  const providedKey = getProvidedKey(req)

  if (!providedKey || providedKey !== WEBSITE_ORDER_API_KEY) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key. Use X-API-Key header or Authorization: Bearer <key>.'
    })
    return
  }

  next()
}
