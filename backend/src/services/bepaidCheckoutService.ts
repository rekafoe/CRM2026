import { logger } from '../utils/logger'

export type BePaidCheckoutInput = {
  amountByn: number
  orderTrackingId: string
  description: string
  customer: {
    email: string
    firstName?: string
    lastName?: string
    phone?: string
  }
  successUrl: string
  failUrl: string
  notificationUrl?: string
  test?: boolean
}

export type BePaidCheckoutResult = {
  token: string
  redirectUrl: string
}

export class BePaidCheckoutError extends Error {
  readonly code: 'config' | 'upstream' | 'validation'
  readonly httpStatus: number

  constructor(message: string, code: BePaidCheckoutError['code'], httpStatus = 502) {
    super(message)
    this.name = 'BePaidCheckoutError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

function getCredentials(): { shopId: string; secretKey: string } {
  const shopId = String(process.env.BEPAID_SHOP_ID || '').trim()
  const secretKey = String(process.env.BEPAID_SECRET_KEY || '').trim()
  if (!shopId || !secretKey) {
    throw new BePaidCheckoutError(
      'Не заданы BEPAID_SHOP_ID и BEPAID_SECRET_KEY в Railway. Укажите те же ключи, что на сайте.',
      'config',
      503,
    )
  }
  return { shopId, secretKey }
}

function isTestMode(explicit?: boolean): boolean {
  if (explicit != null) return explicit
  if (process.env.BEPAID_TEST_MODE === 'false') return false
  if (process.env.BEPAID_PRODUCTION === 'true') return false
  if (process.env.BEPAID_TEST_MODE === 'true') return true
  return process.env.NODE_ENV !== 'production'
}

function checkoutBaseUrl(): string {
  return (process.env.BEPAID_CHECKOUT_URL || 'https://checkout.bepaid.by').replace(/\/$/, '')
}

function sanitizePhone(phone?: string): string | undefined {
  if (!phone) return undefined
  const trimmed = String(phone).trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 15) return undefined
  return trimmed.slice(0, 32)
}

function extractErrorMessage(payload: unknown, httpStatus: number): string {
  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>
    const responseBlock = data.response as { message?: string; errors?: unknown } | undefined
    if (responseBlock?.message) return String(responseBlock.message)
    if (typeof data.message === 'string' && data.message.trim()) return data.message
    const errors = data.errors ?? responseBlock?.errors
    if (errors && typeof errors === 'object') {
      const parts: string[] = []
      for (const [key, val] of Object.entries(errors as Record<string, unknown>)) {
        if (Array.isArray(val)) parts.push(`${key}: ${val.join(', ')}`)
        else if (val != null) parts.push(`${key}: ${String(val)}`)
      }
      if (parts.length) return parts.join('; ')
    }
  }
  return `BePaid HTTP ${httpStatus}`
}

function makeTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

/**
 * Создать checkout BePaid (сумма в копейках: BYN * 100).
 */
export async function createBePaidCheckout(input: BePaidCheckoutInput): Promise<BePaidCheckoutResult> {
  const { shopId, secretKey } = getCredentials()
  const amountMinor = Math.round(Number(input.amountByn) * 100)
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    throw new BePaidCheckoutError('Сумма оплаты должна быть больше нуля', 'validation', 400)
  }
  if (!input.customer.email?.trim()) {
    throw new BePaidCheckoutError('Для ссылки BePaid нужен email клиента', 'validation', 400)
  }

  const test = isTestMode(input.test)
  const authToken = Buffer.from(`${shopId}:${secretKey}`).toString('base64')
  const phone = sanitizePhone(input.customer.phone)
  const requestBody = {
    checkout: {
      test,
      transaction_type: 'payment',
      attempts: 3,
      settings: {
        success_url: input.successUrl,
        decline_url: input.failUrl,
        fail_url: input.failUrl,
        cancel_url: input.failUrl,
        ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
        language: 'ru',
        customer_fields: {
          visible: ['first_name', 'phone'],
          read_only: ['email'],
        },
      },
      payment_method: {
        types: ['credit_card', 'erip'],
      },
      order: {
        amount: amountMinor,
        currency: 'BYN',
        description: input.description.slice(0, 255),
        tracking_id: input.orderTrackingId.slice(0, 255),
      },
      customer: {
        email: input.customer.email.trim(),
        first_name: input.customer.firstName || undefined,
        last_name: input.customer.lastName || undefined,
        ...(phone ? { phone } : {}),
      },
    },
  }

  try {
    const response = await fetch(`${checkoutBaseUrl()}/ctp/api/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authToken}`,
        Accept: 'application/json',
        'X-API-Version': '2',
      },
      body: JSON.stringify(requestBody),
      signal: makeTimeoutSignal(25_000),
    })
    const data = (await response.json().catch(() => null)) as
      | { checkout?: { token?: string; redirect_url?: string }; message?: string; response?: { message?: string } }
      | null
    if (!response.ok) {
      const message = extractErrorMessage(data, response.status)
      logger.warn('BePaid checkout rejected', {
        httpStatus: response.status,
        message,
        trackingId: input.orderTrackingId,
        test,
        shopIdPrefix: shopId.slice(0, 4),
      })
      if (message.toLowerCase().includes('access denied')) {
        throw new BePaidCheckoutError(
          test
            ? 'BePaid: доступ запрещён (test-режим). Проверьте BEPAID_SHOP_ID / BEPAID_SECRET_KEY или выставьте BEPAID_TEST_MODE=false для боевого магазина.'
            : 'BePaid: доступ запрещён. Проверьте BEPAID_SHOP_ID и BEPAID_SECRET_KEY в Railway (и BEPAID_TEST_MODE, если ключи тестовые).',
          'config',
          503,
        )
      }
      throw new BePaidCheckoutError(`BePaid: ${message}`, 'upstream', 502)
    }
    const checkout = data?.checkout
    if (!checkout?.token || !checkout?.redirect_url) {
      throw new BePaidCheckoutError(
        'BePaid вернул неполный ответ (нет token или redirect_url)',
        'upstream',
        502,
      )
    }
    return { token: String(checkout.token), redirectUrl: String(checkout.redirect_url) }
  } catch (error) {
    if (error instanceof BePaidCheckoutError) throw error
    const raw = error instanceof Error ? error.message : String(error)
    const isTimeout =
      raw.toLowerCase().includes('abort') ||
      raw.toLowerCase().includes('timeout') ||
      (error instanceof Error && error.name === 'TimeoutError')
    const message = isTimeout
      ? 'BePaid не ответил вовремя (таймаут). Повторите через минуту.'
      : raw || 'Ошибка при создании платежа BePaid'
    logger.warn('BePaid checkout failed', { message, trackingId: input.orderTrackingId, test })
    throw new BePaidCheckoutError(message, isTimeout ? 'upstream' : 'upstream', 502)
  }
}

export function resolveBePaidReturnUrls(orderId: number): {
  successUrl: string
  failUrl: string
  notificationUrl: string
} {
  const site = (
    process.env.PUBLIC_WEBSITE_URL ||
    process.env.WEBSITE_PUBLIC_URL ||
    'https://printcore.by'
  ).replace(/\/$/, '')
  const crmApi = (
    process.env.PUBLIC_API_BASE_URL ||
    process.env.CRM_PUBLIC_URL ||
    ''
  ).replace(/\/$/, '')
  const apiBase = crmApi || `${site}`
  const notificationUrl = apiBase.includes('/api')
    ? `${apiBase}/webhooks/bepaid`
    : `${apiBase}/api/webhooks/bepaid`
  return {
    successUrl: `${site}/payment/success?crmOrderId=${orderId}`,
    failUrl: `${site}/payment/fail?crmOrderId=${orderId}`,
    notificationUrl,
  }
}

/** Имя клиента → first/last для BePaid. */
export function splitCustomerName(fullName: string | null | undefined): {
  firstName?: string
  lastName?: string
} {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { firstName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}
