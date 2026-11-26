import crypto from 'crypto'

export function normalizeMiniappIdempotencyKey(value: unknown): string | null {
  if (value == null || String(value).trim() === '') return null
  const key = String(value).trim()
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    const error = new Error('Некорректный Idempotency-Key')
    ;(error as { code?: string }).code = 'MINIAPP_IDEMPOTENCY_KEY_INVALID'
    throw error
  }
  return key
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    Object.keys(source).sort().forEach((key) => {
      if (source[key] !== undefined) result[key] = canonicalize(source[key])
    })
    return result
  }
  return value
}

export function miniappRequestHash(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(body)), 'utf8').digest('hex')
}
