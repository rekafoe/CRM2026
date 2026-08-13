import { createHash, timingSafeEqual } from 'crypto'
import { NextFunction, Request, Response } from 'express'

const AUTH_MAIL_API_KEY_HEADER = 'x-api-key'

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/**
 * Сравнение через дайджесты одинаковой длины не раскрывает длину ожидаемого
 * секрета и всегда использует timingSafeEqual для непустых значений.
 */
export function constantTimeKeyEquals(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  return timingSafeEqual(sha256(provided), sha256(expected))
}

function getProvidedMailApiKey(req: Request): string {
  const value = req.headers[AUTH_MAIL_API_KEY_HEADER]
  if (Array.isArray(value)) return ''
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Только отдельный AUTH_MAIL_API_KEY в X-API-Key.
 * Admin JWT и WEBSITE_ORDER_API_KEY намеренно не принимаются.
 */
export function requireAuthMailApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = String(process.env.AUTH_MAIL_API_KEY || '').trim()
  if (!expected) {
    res.status(503).json({
      error: 'Mail verification API is not configured',
      message: 'AUTH_MAIL_API_KEY is not set',
    })
    return
  }

  const provided = getProvidedMailApiKey(req)
  if (!constantTimeKeyEquals(provided, expected)) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing mail API key',
    })
    return
  }

  next()
}
