import dns from 'dns/promises'
import net from 'net'

function isPrivateOrLocalIPv4(parts: number[]): boolean {
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true /* CGNAT */
  return false
}

/** Блокируем SSRF: loopback, частные сети, link-local, .local */
export async function assertPublicHost(hostname: string): Promise<void> {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) {
    throw new Error('Адрес недоступен')
  }
  if (net.isIP(h)) {
    if (h.includes(':')) {
      const a = h.toLowerCase()
      if (a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80:')) {
        throw new Error('Адрес недоступен')
      }
      return
    }
    const parts = h.split('.').map((x) => parseInt(x, 10))
    if (parts.length === 4 && isPrivateOrLocalIPv4(parts)) throw new Error('Адрес недоступен')
    return
  }
  const { address } = await dns.lookup(h)
  if (net.isIP(address)) {
    if (address.includes(':')) {
      const a = address.toLowerCase()
      if (a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80:')) {
        throw new Error('Адрес недоступен')
      }
      return
    }
    const parts = address.split('.').map((x) => parseInt(x, 10))
    if (parts.length === 4 && isPrivateOrLocalIPv4(parts)) throw new Error('Адрес недоступен')
  }
}

/**
 * Проверка HTTP(S) URL перед серверным fetch (SSRF).
 * Возвращает нормализованную строку URL.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<string> {
  const urlStr = String(rawUrl || '').trim()
  if (!urlStr) throw new Error('Пустая ссылка')

  let parsed: URL
  try {
    parsed = new URL(urlStr)
  } catch {
    throw new Error('Некорректная ссылка')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Разрешены только HTTP(S)')
  }

  await assertPublicHost(parsed.hostname)
  return parsed.toString()
}

export type SafeFetchOptions = {
  headers?: Record<string, string>
  cache?: RequestCache
  maxRedirects?: number
}

/**
 * fetch с проверкой каждого hop редиректа — иначе redirect:follow обходит SSRF-фильтр.
 */
export async function fetchPublicHttpUrl(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<globalThis.Response> {
  const maxRedirects = options.maxRedirects ?? 5
  let current = await assertPublicHttpUrl(rawUrl)

  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(current, {
      redirect: 'manual',
      cache: options.cache ?? 'no-store',
      headers: options.headers,
    })

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) {
        throw new Error('Редирект без Location')
      }
      const next = new URL(location, current).toString()
      current = await assertPublicHttpUrl(next)
      continue
    }

    return res
  }

  throw new Error('Слишком много редиректов')
}
