import { Request, Response, NextFunction } from 'express'
import { getDb } from '../config/database'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  console.log(`🔍 Auth middleware: ${req.method} ${req.path}`);
  
  const openPaths = [
    // infra / health
    /^\/$/,
    /^\/health$/,
    // public widget needs these
    /^\/api\/presets/,
    /^\/api\/orders\/[0-9]+\/items$/,
    /^\/api\/orders\/[0-9]+\/prepay$/,
    /^\/api\/webhooks\/bepaid$/,
    // auth endpoints
    /^\/api\/auth\/login$/,
    /^\/api\/auth\/me$/,
    // backward compat
    /^\/login$/,
    // temporary for testing calculator
    /^\/api\/universal-calculator/,
    /^\/api\/materials\/test-calculator$/,
    /^\/api\/debug-routes$/,
    // pricing policy endpoints (all pricing routes are public for management)
    /^\/api\/pricing/,
    // enhanced calculator endpoints
    /^\/api\/enhanced-calculator/,
    // 🆕 Calculator material endpoints (for public access)
    // materials: только GET /api/materials открыт (см. ниже метод-проверку)
    /^\/api\/suppliers$/,
    /^\/api\/product-configs$/,
    // 🆕 Notifications endpoints (temporary for testing)
    /^\/api\/notifications/,
    // 🆕 Photo orders endpoints (temporary for testing)
    /^\/api\/photo-orders/,
    // 🆕 Products and printing technologies for calculator
    /^\/api\/products/,
    /^\/api\/printing-technologies/,
    /^\/api\/operations/,
    /^\/api\/printers/,
    /^\/api\/reports/,
    /^\/api\/daily-reports/,
    /^\/api\/material-categories/,
    /^\/api\/suppliers/,
    /^\/api\/notifications/,
    /^\/api\/warehouse-reports/
  ]

  const isOpenPath = openPaths.some(r => r.test(req.path))
    || (req.path === '/api/materials' && req.method === 'GET')
    || (req.path.startsWith('/api/paper-types') && req.method === 'GET')
    || ((req.path === '/api/material-categories' || req.path === '/api/material-categories/stats') && req.method === 'GET')
    || (/^\/api\/material-categories\/[0-9]+$/.test(req.path) && req.method === 'GET');
  console.log(`🔍 Is open path: ${isOpenPath}`);
  
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

    console.log(`✅ Allowing access to ${req.path}`);
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
