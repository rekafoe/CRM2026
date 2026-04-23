import { Request, Response, NextFunction } from 'express'
import { getDb } from '../config/database'
import { isWebsiteOrderApiKeyValid } from './websiteOrderApiKey'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface PublicRouteRule {
  method: Method
  path: RegExp
}

const PUBLIC_ROUTE_RULES: PublicRouteRule[] = [
  // infra / docs
  { method: 'GET', path: /^\/$/ },
  { method: 'GET', path: /^\/health$/ },
  { method: 'GET', path: /^\/api-docs(?:\/.*)?$/ },
  { method: 'GET', path: /^\/api-docs\.json$/ },
  // auth
  { method: 'POST', path: /^\/api\/auth\/login$/ },
  { method: 'GET', path: /^\/api\/auth\/me$/ },
  { method: 'POST', path: /^\/login$/ },
  // website/public calculator
  { method: 'GET', path: /^\/api\/presets(?:\/.*)?$/ },
  // Витрина/калькулятор: trailing slash, ЧПУ по route_key, пресеты (анонимно без 401)
  { method: 'GET', path: /^\/api\/products\/?$/ },
  { method: 'GET', path: /^\/api\/products\/by-route-key\/[^/]+\/?$/ },
  { method: 'GET', path: /^\/api\/products\/parameter-presets\/?$/ },
  { method: 'GET', path: /^\/api\/products\/categories\/?$/ },
  { method: 'GET', path: /^\/api\/products\/category\/[0-9]+\/?$/ },
  // Один сегмент — slug (напр. /api/products/photo), не числовой id; детали в handler по route_key
  { method: 'GET', path: /^\/api\/products\/[a-z][-a-z0-9]*\/?$/ },
  { method: 'GET', path: /^\/api\/products\/[0-9]+\/schema\/?$/ },
  { method: 'GET', path: /^\/api\/products\/[0-9]+\/tier-prices\/?$/ },
  { method: 'POST', path: /^\/api\/products\/[0-9]+\/calculate$/ },
  { method: 'POST', path: /^\/api\/products\/[0-9]+\/validate-size$/ },
  { method: 'POST', path: /^\/api\/pricing\/calculate$/ },
  // печать документов / многостраничный калькулятор для публичного сайта (как karandash-style)
  { method: 'GET', path: /^\/api\/pricing\/multipage\/schema\/?$/ },
  { method: 'GET', path: /^\/api\/pricing\/multipage\/binding-types\/?$/ },
  { method: 'POST', path: /^\/api\/pricing\/multipage\/calculate\/?$/ },
  { method: 'GET', path: /^\/api\/materials$/ },
  { method: 'GET', path: /^\/api\/paper-types(?:\/.*)?$/ },
  { method: 'GET', path: /^\/api\/material-categories$/ },
  { method: 'GET', path: /^\/api\/material-categories\/stats$/ },
  { method: 'GET', path: /^\/api\/material-categories\/[0-9]+$/ },
  { method: 'GET', path: /^\/api\/printing-technologies$/ },
  // webhooks / website orders
  { method: 'POST', path: /^\/api\/webhooks\/bepaid$/ },
  { method: 'POST', path: /^\/api\/orders\/from-website$/ },
  { method: 'POST', path: /^\/api\/orders\/from-website\/with-files$/ },
  { method: 'POST', path: /^\/api\/orders\/from-website\/[0-9]+\/files$/ },
  { method: 'GET', path: /^\/api\/orders\/[0-9]+\/items$/ },
  { method: 'GET', path: /^\/api\/orders\/[0-9]+\/prepay$/ },
]

function isPublicRoute(req: Request): boolean {
  const method = req.method.toUpperCase() as Method
  return PUBLIC_ROUTE_RULES.some((rule) => rule.method === method && rule.path.test(req.path))
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  // Пересчёт ЗП: всегда пропускаем запрос в обработчик (авторизация там: admin или secret)
  const isRecalcPath = req.path.endsWith('/earnings/recalculate') || req.path === '/earnings/recalculate'

  // POST /api/orders/:id/files с валидным API-ключом сайта (загрузка файлов к заказу с сайта)
  const postOrderFilesPath = /\/api\/orders\/[0-9]+\/files$/
  const isPostOrderFilesPath = req.method === 'POST' && (postOrderFilesPath.test(req.path) || (req.originalUrl && postOrderFilesPath.test(req.originalUrl.split('?')[0])))
  const isPostOrderFilesWithWebsiteKey = isPostOrderFilesPath && isWebsiteOrderApiKeyValid(req)

  const isOpenPath = isRecalcPath
    || isPostOrderFilesWithWebsiteKey
    || isPublicRoute(req)
  
  if (isOpenPath) {
    // Open path = анонимный доступ разрешён, но если токен передан — попробуем определить пользователя
    // (нужно для админских действий на "частично открытых" эндпоинтах вроде /api/suppliers).
    const auth = req.headers['authorization'] || ''
    const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : undefined

    if (token) {
      try {
        const db = await getDb()
        const user = await db.get<{ id: number; role: string }>(
          'SELECT id, role FROM users WHERE api_token = ?',
          token
        )
        if (user) {
          ;(req as AuthenticatedRequest).user = user
        }
      } catch {
        // игнорируем: для open-path не обязаны валидировать токен
      }
    }
    return next();
  }
  
  const auth = req.headers['authorization'] || ''
  const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : undefined
  
  if (!token) { 
    res.status(401).json({ message: 'Unauthorized' })
    return 
  }
  
  const db = await getDb()
  const user = await db.get<{ id: number; role: string }>('SELECT id, role FROM users WHERE api_token = ?', token)
  
  if (!user) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
  
  ;(req as AuthenticatedRequest).user = user
  next()
}

// Экспорт для обратной совместимости
export const authMiddleware = authenticate
