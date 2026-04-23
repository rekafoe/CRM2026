/**
 * Настройки SMS (провайдер, дебаунс, тихие часы в Europe/Minsk).
 */
export function isSmsEnabled(): boolean {
  return String(process.env.SMS_ENABLED || '').toLowerCase() === 'true' || process.env.SMS_ENABLED === '1'
}

export function getSmsDebounceSeconds(): number {
  const n = parseInt(String(process.env.SMS_DEBOUNCE_SECONDS || '120'), 10)
  if (!Number.isFinite(n) || n < 0) return 120
  return Math.min(3600, n)
}

/** Начало «дня» в минутах от полуночи, Минск (включительно) */
export function getSmsQuietStartMinutes(): number {
  return parseTimeToMinutes(process.env.SMS_QUIET_HOURS_START, 8, 30)
}

/** Конец окна (исключая): до этого минуты; по умолчанию 20:00 */
export function getSmsQuietEndMinutes(): number {
  return parseTimeToMinutes(process.env.SMS_QUIET_HOURS_END, 20, 0)
}

function parseTimeToMinutes(env: string | undefined, defH: number, defM: number): number {
  const s = (env || `${defH}:${defM < 10 ? '0' : ''}${defM}`).trim()
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(s)
  if (!m) return defH * 60 + defM
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)))
  return h * 60 + min
}

export function getSmsWorkerIntervalMs(): number {
  const n = parseInt(String(process.env.SMS_WORKER_INTERVAL_MS || '20000'), 10)
  if (!Number.isFinite(n) || n < 5000) return 20000
  return Math.min(120_000, n)
}

export type SmsProviderName = 'log' | 'http'

export function getSmsProviderName(): SmsProviderName {
  const v = String(process.env.SMS_PROVIDER || 'log').toLowerCase()
  if (v === 'http') return 'http'
  return 'log'
}

export function getSmsHttpUrl(): string {
  return String(process.env.SMS_HTTP_URL || '').trim()
}

export function getSmsHttpMethod(): 'POST' | 'GET' {
  return String(process.env.SMS_HTTP_METHOD || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST'
}

/** JSON с плейсхолдерами {{phone}} и {{text}} (или $phone) */
export function getSmsHttpBodyTemplate(): string {
  return String(process.env.SMS_HTTP_BODY || '{"phone":"{{phone}}","message":"{{text}}"}')
}

export function getSmsHttpHeadersJson(): string {
  return String(process.env.SMS_HTTP_HEADERS || '{}')
}
