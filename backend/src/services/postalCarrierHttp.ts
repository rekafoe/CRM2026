import { PostalCarrierError, asJson, carrierErrorText } from './postalCarrierParse'

export type CarrierHttpResponse = {
  status: number
  contentType: string
  body: Buffer
}

export type CarrierRequest = (input: {
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: unknown
  timeoutMs?: number
}) => Promise<CarrierHttpResponse>

export const carrierRequest: CarrierRequest = async (input) => {
  const headers: Record<string, string> = { Accept: '*/*', ...(input.headers || {}) }
  if (input.body !== undefined) headers['Content-Type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(input.url, {
      method: input.method,
      headers,
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
      signal: AbortSignal.timeout(input.timeoutMs ?? 25000),
    })
  } catch (error: any) {
    const reason = error?.name === 'TimeoutError' ? 'таймаут' : (error?.message || 'сеть недоступна')
    throw new PostalCarrierError(`Перевозчик не ответил: ${reason}`, 502)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    body: bytes,
  }
}

export function assertCarrierOk(response: CarrierHttpResponse, who: string): void {
  if (response.status >= 200 && response.status < 300) return
  const parsed = asJson(response.body)
  const detail = carrierErrorText(parsed) || response.body.toString('utf8').replace(/\s+/g, ' ').trim().slice(0, 400)
  const access = response.status === 401 || response.status === 403
  throw new PostalCarrierError(
    access
      ? `${who} отклонил доступ. Проверьте ключ в настройках.${detail ? ` ${detail}` : ''}`
      : `${who}: ${detail || `ответ ${response.status}`}`,
    access ? 409 : 502,
  )
}

export function readJson(response: CarrierHttpResponse, who: string): unknown {
  assertCarrierOk(response, who)
  const parsed = asJson(response.body)
  if (parsed == null) {
    throw new PostalCarrierError(`${who} вернул не JSON`, 502)
  }
  return parsed
}
