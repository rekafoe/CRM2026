import dns from 'dns/promises'
import net from 'net'

const MAX_BYTES = 25 * 1024 * 1024

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

/** Блокируем SSRF: loopback, частные сети, link-local */
async function assertPublicHost(hostname: string): Promise<void> {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) {
    throw new Error('Адрес недоступен')
  }
  if (net.isIP(h)) {
    if (h.includes(':')) {
      if (h === '::1') throw new Error('Адрес недоступен')
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
      if (a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80:'))
        throw new Error('Адрес недоступен')
      return
    }
    const parts = address.split('.').map((x) => parseInt(x, 10))
    if (parts.length === 4 && isPrivateOrLocalIPv4(parts)) throw new Error('Адрес недоступен')
  }
}

/**
 * Ссылка «просмотр» Google Drive → прямая выдача файла (если доступ открыт).
 */
function normalizeGoogleDriveShareUrl(url: string): string {
  const m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i)
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`
  return url
}

export async function fetchImageFromRemoteUrl(rawUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
  let urlStr = rawUrl.trim()
  if (!urlStr) throw new Error('Пустая ссылка')

  urlStr = normalizeGoogleDriveShareUrl(urlStr)

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

  const res = await fetch(urlStr, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'CRM-ImageProxy/1.0',
      Accept: 'image/*,*/*;q=0.8',
    },
  })

  if (!res.ok) {
    throw new Error(`Сервер вернул ${res.status}`)
  }

  const len = res.headers.get('content-length')
  if (len && parseInt(len, 10) > MAX_BYTES) {
    throw new Error('Файл слишком большой')
  }

  const ab = await res.arrayBuffer()
  if (ab.byteLength > MAX_BYTES) {
    throw new Error('Файл слишком большой')
  }

  let contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!contentType.startsWith('image/')) {
    const sniff = detectImageMime(Buffer.from(ab.slice(0, 16)))
    if (sniff) contentType = sniff
    else throw new Error('Ответ не похож на изображение')
  }

  return { buffer: Buffer.from(ab), contentType }
}

function detectImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp'
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'II*\x00') return 'image/tiff'
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'MM\x00*') return 'image/tiff'
  return null
}
