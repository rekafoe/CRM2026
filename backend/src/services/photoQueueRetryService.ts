const DEFAULT_RETRY_URL = 'https://printcore.by/api/orders/crm/photo-queue-retry'

export class PhotoQueueRetryError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'PhotoQueueRetryError'
    this.status = status
  }
}

type RetryResponse = {
  ok: true
  started: boolean
  count: number
}

function retryUrl(): string {
  return process.env.PHOTO_QUEUE_RETRY_URL?.trim() || DEFAULT_RETRY_URL
}

function siteErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const record = body as { error?: unknown; message?: unknown }
    const message = record.error ?? record.message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return fallback
}

/** Просит сайт заново собрать фотофайлы заказа. Секрет очереди остаётся на сервере CRM. */
export async function retryWebsitePhotoFiles(
  orderId: number,
  fetchImpl: typeof fetch = fetch
): Promise<RetryResponse> {
  const secret = process.env.CRM_PHOTO_QUEUE_CRON_SECRET?.trim()
  if (!secret) {
    throw new PhotoQueueRetryError(503, 'На сервере CRM не задан секрет очереди фото')
  }

  let response: Response
  try {
    response = await fetchImpl(retryUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: String(orderId), processNow: true }),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new PhotoQueueRetryError(502, 'Сайт не ответил на перезапуск сборки фото')
  }

  const text = await response.text().catch(() => '')
  let body: unknown = {}
  if (text) {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = {}
    }
  }

  if (!response.ok) {
    throw new PhotoQueueRetryError(
      502,
      siteErrorMessage(body, 'Сайт не принял перезапуск сборки фото')
    )
  }

  const count = Number((body as { count?: unknown }).count)
  if (!Number.isFinite(count) || count <= 0) {
    throw new PhotoQueueRetryError(404, 'В очереди сайта нет сборки фото для этого заказа')
  }

  return {
    ok: true,
    started: (body as { started?: unknown }).started !== false,
    count,
  }
}
