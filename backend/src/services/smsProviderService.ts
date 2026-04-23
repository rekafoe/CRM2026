import { getSmsHttpBodyTemplate, getSmsHttpHeadersJson, getSmsHttpMethod, getSmsHttpUrl, getSmsProviderName } from '../config/sms'
import { logger } from '../utils/logger'

export interface SmsSendInput {
  to: string
  text: string
}

export class LogSmsProvider {
  async send(input: SmsSendInput): Promise<void> {
    logger.info('SMS (log provider)', { to: input.to, len: input.text.length })
  }
}

/**
 * {{phone}} / {{text}} в теле; заголовок JSON из env.
 */
export class HttpSmsProvider {
  async send(input: SmsSendInput): Promise<void> {
    const url = getSmsHttpUrl()
    if (!url) {
      throw new Error('SMS_HTTP_URL not set')
    }
    const method = getSmsHttpMethod()
    const bodyT = getSmsHttpBodyTemplate()
    const body = bodyT
      .replace(/\{\{phone\}\}/g, input.to)
      .replace(/\{\{text\}\}/g, input.text)
    let headers: Record<string, string> = { 'Content-Type': 'application/json' }
    try {
      const h = JSON.parse(getSmsHttpHeadersJson()) as Record<string, string>
      if (h && typeof h === 'object') headers = { ...headers, ...h }
    } catch {
      // ignore
    }
    const res = await fetch(url, {
      method,
      headers,
      body: method === 'GET' ? undefined : body,
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new Error(`SMS HTTP ${res.status}: ${t.slice(0, 200)}`)
    }
  }
}

let cached: LogSmsProvider | HttpSmsProvider | null = null

export function getSmsProvider(): LogSmsProvider | HttpSmsProvider {
  if (cached) return cached
  const n = getSmsProviderName()
  if (n === 'http') {
    cached = new HttpSmsProvider()
  } else {
    cached = new LogSmsProvider()
  }
  return cached
}

export async function sendSmsThroughProvider(input: SmsSendInput): Promise<void> {
  return getSmsProvider().send(input)
}
