import crypto from 'crypto'
import { Request } from 'express'
import { SupportError } from './supportErrors'

export interface WebsiteCustomer {
  id: string
  name: string
  email: string
  phone: string
}

const USER_ID = /^[A-Za-z0-9_-]{1,64}$/
const MAX_TOKEN_BYTES = 1024

function clipText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function clipPhone(value: unknown): string {
  const text = clipText(value, 32)
  return text.replace(/[^\d+\-() ]/g, '').trim()
}

export function keysMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided)
  const right = Buffer.from(expected)
  if (left.length !== right.length) {
    crypto.timingSafeEqual(right, right)
    return false
  }
  return crypto.timingSafeEqual(left, right)
}

export function readSupportCustomer(req: Request): WebsiteCustomer {
  const expected = String(process.env.CRM_SUPPORT_API_KEY || '').trim()
  if (!expected) {
    throw new SupportError(503, 'Поддержка временно недоступна')
  }
  const provided = String(req.headers['x-api-key'] || '').trim()
  if (!provided || !keysMatch(provided, expected)) {
    throw new SupportError(401, 'Требуется авторизация')
  }

  const token = String(req.headers['x-support-user'] || '').trim()
  if (!token || Buffer.byteLength(token) > MAX_TOKEN_BYTES * 2) {
    throw new SupportError(401, 'Требуется авторизация')
  }

  let parsed: unknown
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8')
    if (Buffer.byteLength(json) > MAX_TOKEN_BYTES) {
      throw new Error('too large')
    }
    parsed = JSON.parse(json)
  } catch {
    throw new SupportError(401, 'Требуется авторизация')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SupportError(401, 'Требуется авторизация')
  }
  const record = parsed as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!USER_ID.test(id)) {
    throw new SupportError(401, 'Требуется авторизация')
  }

  return {
    id,
    name: clipText(record.name, 120) || 'Клиент',
    email: clipText(record.email, 160),
    phone: clipPhone(record.phone),
  }
}
