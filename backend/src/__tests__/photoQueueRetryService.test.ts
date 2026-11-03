import { PhotoQueueRetryError, retryWebsitePhotoFiles } from '../services/photoQueueRetryService'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('retryWebsitePhotoFiles', () => {
  const previousSecret = process.env.CRM_PHOTO_QUEUE_CRON_SECRET
  const previousUrl = process.env.PHOTO_QUEUE_RETRY_URL

  afterEach(() => {
    if (previousSecret == null) delete process.env.CRM_PHOTO_QUEUE_CRON_SECRET
    else process.env.CRM_PHOTO_QUEUE_CRON_SECRET = previousSecret
    if (previousUrl == null) delete process.env.PHOTO_QUEUE_RETRY_URL
    else process.env.PHOTO_QUEUE_RETRY_URL = previousUrl
  })

  it('отказывается работать без секрета очереди', async () => {
    delete process.env.CRM_PHOTO_QUEUE_CRON_SECRET
    const fetchImpl = jest.fn()

    await expect(retryWebsitePhotoFiles(13825, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      status: 503,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('передаёт номер заказа на сайт и не светит секрет наружу', async () => {
    process.env.CRM_PHOTO_QUEUE_CRON_SECRET = 'test-secret'
    process.env.PHOTO_QUEUE_RETRY_URL = 'https://printcore.by/api/orders/crm/photo-queue-retry'
    const fetchImpl = jest.fn(async () => jsonResponse(200, { ok: true, started: true, count: 1 }))

    await expect(retryWebsitePhotoFiles(13825, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      ok: true,
      started: true,
      count: 1,
    })

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://printcore.by/api/orders/crm/photo-queue-retry')
    expect(init.body).toBe(JSON.stringify({ q: '13825', processNow: true }))
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-secret')
  })

  it('сообщает, если очереди для заказа нет', async () => {
    process.env.CRM_PHOTO_QUEUE_CRON_SECRET = 'test-secret'
    const fetchImpl = jest.fn(async () => jsonResponse(200, { ok: true, started: true, count: 0 }))

    await expect(retryWebsitePhotoFiles(13825, fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(
      PhotoQueueRetryError
    )
    await expect(retryWebsitePhotoFiles(13825, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      status: 404,
    })
  })
})
