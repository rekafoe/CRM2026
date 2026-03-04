/**
 * Доступ к /api/uploads/* и /uploads/* по API-ключу (WEBSITE_ORDER_API_KEY)
 * или по токену пользователя CRM.
 * Позволяет сайту загружать картинки продуктов/категорий/подтипов.
 */

import { Request, Response, NextFunction } from 'express'
import { getDb } from '../config/database'
import { isWebsiteOrderApiKeyValid } from './websiteOrderApiKey'

const API_KEY_QUERY = 'api_key'

export async function uploadsApiKeyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // UPLOADS_PUBLIC=true — картинки доступны всем (сайт, img src без ключа)
  if (process.env.UPLOADS_PUBLIC === 'true' || process.env.UPLOADS_PUBLIC === '1') {
    return next()
  }
  const envKey = process.env.WEBSITE_ORDER_API_KEY || ''
  // Если ключ не настроен — открытый доступ (для dev / обратная совместимость)
  if (!envKey.trim()) {
    return next()
  }

  // Проверяем ключ в заголовках (X-API-Key, Authorization Bearer)
  if (isWebsiteOrderApiKeyValid(req)) {
    return next()
  }

  // Проверяем ключ в query (?api_key=xxx) — для img src, где нельзя передать заголовки
  const queryKey = (req.query[API_KEY_QUERY] as string)?.trim()
  if (queryKey && queryKey === envKey) {
    return next()
  }

  // Проверяем токен пользователя CRM (Authorization Bearer)
  const auth = req.headers['authorization'] || ''
  const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : undefined
  if (token) {
    try {
      const db = await getDb()
      const user = await db.get<{ id: number }>('SELECT id FROM users WHERE api_token = ?', [token])
      if (user) {
        return next()
      }
    } catch {
      // игнорируем
    }
  }

  res.status(401).json({
    error: 'Unauthorized',
    message: 'Для доступа к файлам укажите X-API-Key, Authorization: Bearer <key> или ?api_key=<key>',
  })
}
