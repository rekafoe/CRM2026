import { convertHeicToJpegBytes } from './heicConvertServer'
import { isHeicLikeRaster, isHeicMime } from './heicDetect'

const MOCKUP_FETCH_TIMEOUT_MS = 120_000
const MOCKUP_FETCH_ATTEMPTS = 3

function mockupApiBases(): string[] {
  const seen = new Set<string>()
  const bases: string[] = []
  const add = (raw?: string) => {
    const base = raw?.trim().replace(/\/+$/, '')
    if (!base || seen.has(base)) return
    seen.add(base)
    bases.push(base)
  }
  add(process.env.MOCKUPS_API_URL)
  add(process.env.PRINTCORE_API_URL)
  add(process.env.PRINTCORE_BACKEND_URL ? `${process.env.PRINTCORE_BACKEND_URL.replace(/\/+$/, '')}/api` : undefined)
  add('https://printcore.by/api')
  return bases
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchImage(apiBase: string, mockupId: string): Promise<Blob | null> {
  const response = await fetch(`${apiBase}/mockups/${encodeURIComponent(mockupId)}/image`, {
    signal: AbortSignal.timeout(MOCKUP_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) return null
  const blob = await response.blob()
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim() || blob.type || 'image/jpeg'
  if (blob.type === mime) return blob
  return new Blob([await blob.arrayBuffer()], { type: mime })
}

export async function fetchMockupRasterBlob(mockupId: string): Promise<Blob | null> {
  const id = mockupId.trim()
  if (!id) return null
  const errors: string[] = []

  for (const apiBase of mockupApiBases()) {
    for (let attempt = 1; attempt <= MOCKUP_FETCH_ATTEMPTS; attempt += 1) {
      try {
        const blob = await fetchImage(apiBase, id)
        if (!blob) {
          errors.push(`${apiBase}#${attempt}: empty`)
        } else {
          const bytes = new Uint8Array(await blob.arrayBuffer())
          if (!isHeicLikeRaster(bytes, blob.type) && !isHeicMime(blob.type)) {
            return new Blob([bytes], { type: blob.type || 'image/jpeg' })
          }
          const jpeg = await convertHeicToJpegBytes(bytes, 0.95)
          return new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' })
        }
      } catch (error) {
        errors.push(`${apiBase}#${attempt}: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (attempt < MOCKUP_FETCH_ATTEMPTS) await sleepMs(Math.min(1000 * 2 ** (attempt - 1), 8000))
    }
  }

  console.error('[crmPhotoPdf] mockup fetch failed', { mockupId: id, errors: errors.slice(-6) })
  return null
}
