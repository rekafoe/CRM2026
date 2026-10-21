import { SupportError } from './supportErrors'

const WINDOW_MS = 60_000
const USER_MAX = 20
const IP_MAX = 60

interface Bucket {
  count: number
  reset: number
}

const buckets = new Map<string, Bucket>()

function hit(key: string, max: number) {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || now > current.reset) {
    buckets.set(key, { count: 1, reset: now + WINDOW_MS })
    return
  }
  current.count += 1
  if (current.count > max) {
    throw new SupportError(429, 'Слишком много сообщений. Подождите минуту.')
  }
}

export function assertSupportWriteAllowed(userId: string, ip: string) {
  hit(`user:${userId}`, USER_MAX)
  hit(`ip:${ip || 'unknown'}`, IP_MAX)
}

export function resetSupportWriteLimits() {
  buckets.clear()
}
