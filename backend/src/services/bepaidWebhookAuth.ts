import type { Request } from 'express'

export function mapBePaidStatus(raw: string): 'paid' | 'failed' | 'pending' | null {
  const s = raw.toLowerCase()
  if (s === 'successful' || s === 'paid' || s === 'success') return 'paid'
  if (s === 'failed' || s === 'error' || s === 'declined' || s === 'expired') return 'failed'
  if (s === 'pending' || s === 'incomplete' || s === 'in_progress') return 'pending'
  return null
}

/** BePaid sends Shop ID:Secret Key via HTTP Basic Auth on notifications. */
export function isBePaidBasicAuthValid(req: Pick<Request, 'headers'>): boolean {
  const shopId = String(process.env.BEPAID_SHOP_ID || '').trim()
  const secretKey = String(process.env.BEPAID_SECRET_KEY || '').trim()
  if (!shopId || !secretKey) return false
  const header = String(req.headers.authorization || '')
  if (!header.toLowerCase().startsWith('basic ')) return false
  try {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8')
    const colon = decoded.indexOf(':')
    if (colon < 0) return false
    const user = decoded.slice(0, colon)
    const pass = decoded.slice(colon + 1)
    return user === shopId && pass === secretKey
  } catch {
    return false
  }
}
