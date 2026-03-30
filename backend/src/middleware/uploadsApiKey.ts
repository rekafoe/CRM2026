/**
 * Доступ к /api/uploads/* и /uploads/* по API-ключу (WEBSITE_ORDER_API_KEY)
 * или по токену пользователя CRM.
 * Позволяет сайту загружать картинки продуктов/категорий/подтипов.
 */

import { Request, Response, NextFunction } from 'express'
import { getDb } from '../config/database'
import { isWebsiteOrderApiKeyValid } from './websiteOrderApiKey'

const API_KEY_QUERY = 'api_key'

/** Файлы в корне uploads (маркетинг: продукты, категории, подтипы). <img src> не шлёт заголовки с ключом. */
const PUBLIC_IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|avif|ico)$/i

export async function uploadsApiKeyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production'
  const allowQueryApiKey = process.env.UPLOADS_ALLOW_QUERY_API_KEY === 'true' || process.env.UPLOADS_ALLOW_QUERY_API_KEY === '1'

  // UPLOADS_PUBLIC=true — картинки доступны всем (сайт, img src без ключа)
  if (process.env.UPLOADS_PUBLIC === 'true' || process.env.UPLOADS_PUBLIC === '1') {
    return next()
  }

  // Публичное чтение изображений по GET/HEAD: иначе внешний сайт не может показать картинки подтипов (401 без ключа).
  // Каталог orders/ отсекается в index.ts (blockOrdersPath) до static — сюда не попадает.
  if (req.method === 'GET' || req.method === 'HEAD') {
    const rel = (req.path || '').replace(/^\/+/, '')
    if (rel && PUBLIC_IMAGE_FILE.test(rel)) {
      return next()
    }
  }
  const envKey = process.env.WEBSITE_ORDER_API_KEY || ''
  // Fail-closed для production: без ключа доступ к uploads запрещен
  if (!envKey.trim()) {
    if (isProduction) {
      res.status(503).json({
        error: 'Uploads are not configured',
        message: 'WEBSITE_ORDER_API_KEY is not set',
      })
      return
    }
    return next()
  }

  // Проверяем ключ в заголовках (X-API-Key, Authorization Bearer)
  if (isWebsiteOrderApiKeyValid(req)) {
    return next()
  }

  // Проверяем ключ в query (?api_key=xxx): по умолчанию выключено в production
  if (!isProduction || allowQueryApiKey) {
    const queryKey = (req.query[API_KEY_QUERY] as string)?.trim()
    if (queryKey && queryKey === envKey) {
      return next()
    }
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
    message: (!isProduction || allowQueryApiKey)
      ? 'Для доступа к файлам укажите X-API-Key, Authorization: Bearer <key> или ?api_key=<key>'
      : 'Для доступа к файлам укажите X-API-Key или Authorization: Bearer <key>',
  })
}
