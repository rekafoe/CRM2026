/**
 * Минимальные вызовы Telegram Bot API (getWebhookInfo, setWebhook, deleteWebhook).
 * Токен не логируем.
 */
const BASE = 'https://api.telegram.org'

export function previewTelegramText(text: string | undefined, max = 50): string {
  if (text == null || text === '') return ''
  return text.length <= max ? text : `${text.slice(0, max)}...`
}

export interface TelegramApiResult<T = unknown> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
}

export async function callTelegramMethod<T = unknown>(
  token: string,
  method: string,
  searchParams?: Record<string, string | number | boolean | undefined>
): Promise<TelegramApiResult<T>> {
  const u = new URL(`${BASE}/bot${token}/${method}`)
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v === undefined) continue
      u.searchParams.set(k, String(v))
    }
  }
  const r = await fetch(u.toString(), { method: 'GET' })
  return (await r.json()) as TelegramApiResult<T>
}

export type TelegramWebhookInfoResult = {
  url?: string
  has_custom_certificate?: boolean
  pending_update_count?: number
  last_error_date?: number
  last_error_message?: string
  max_connections?: number
  allowed_updates?: string[]
}
