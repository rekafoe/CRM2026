const TAXPAYER_REGISTRY_URL = 'https://grp.nalog.gov.by/grp/getData'
const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 500

export interface TaxpayerRegistryDto {
  unp: string
  fullName: string | null
  shortName: string | null
  address: string | null
  registrationDate: string | null
  taxOfficeCode: string | null
  taxOfficeName: string | null
  statusCode: string | null
  statusLabel: string | null
  isActive: boolean
}

export type TaxpayerRegistryErrorCode =
  | 'INVALID_UNP'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'INVALID_RESPONSE'

export class TaxpayerRegistryError extends Error {
  constructor(
    message: string,
    public readonly code: TaxpayerRegistryErrorCode,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'TaxpayerRegistryError'
  }
}

type RegistryRow = {
  VUNP?: unknown
  VNAIMP?: unknown
  VNAIMK?: unknown
  VPADRES?: unknown
  DREG?: unknown
  NMNS?: unknown
  VMNS?: unknown
  CKODSOST?: unknown
  VKODS?: unknown
}

function nullableTrimmedString(value: unknown): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

export function isValidUnp(unp: unknown): unp is string {
  return typeof unp === 'string' && /^\d{9}$/.test(unp)
}

export function parseTaxpayerRegistryPayload(payload: unknown): TaxpayerRegistryDto | null {
  if (!payload || typeof payload !== 'object') return null
  const row = (payload as { ROW?: unknown }).ROW
  if (!row || typeof row !== 'object') return null

  const source = row as RegistryRow
  const unp = nullableTrimmedString(source.VUNP)
  if (!unp || !isValidUnp(unp)) return null

  const statusLabel = nullableTrimmedString(source.VKODS)
  return {
    unp,
    fullName: nullableTrimmedString(source.VNAIMP),
    shortName: nullableTrimmedString(source.VNAIMK),
    address: nullableTrimmedString(source.VPADRES),
    registrationDate: nullableTrimmedString(source.DREG),
    taxOfficeCode: nullableTrimmedString(source.NMNS),
    taxOfficeName: nullableTrimmedString(source.VMNS),
    statusCode: nullableTrimmedString(source.CKODSOST),
    statusLabel,
    isActive: statusLabel?.trim().toLowerCase() === 'действующий',
  }
}

interface TaxpayerRegistryServiceOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  cacheTtlMs?: number
}

export class TaxpayerRegistryService {
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly cacheTtlMs: number
  private readonly cache = new Map<string, { value: TaxpayerRegistryDto; expiresAt: number }>()

  constructor(options: TaxpayerRegistryServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  }

  async lookup(unpInput: unknown): Promise<TaxpayerRegistryDto> {
    const unp = typeof unpInput === 'string' ? unpInput.trim() : ''
    if (!isValidUnp(unp)) {
      throw new TaxpayerRegistryError('УНП должен содержать ровно 9 цифр', 'INVALID_UNP', 400)
    }

    const now = Date.now()
    const cached = this.cache.get(unp)
    if (cached && cached.expiresAt > now) return cached.value
    if (cached) this.cache.delete(unp)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const url = new URL(TAXPAYER_REGISTRY_URL)
      url.searchParams.set('unp', unp)
      url.searchParams.set('type', 'json')
      url.searchParams.set('charset', 'UTF-8')

      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })

      if (response.status === 404) {
        throw new TaxpayerRegistryError('Плательщик с указанным УНП не найден', 'NOT_FOUND', 404)
      }
      if (!response.ok) {
        throw new TaxpayerRegistryError('Сервис ГРП МНС временно недоступен', 'UPSTREAM_ERROR', 502)
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new TaxpayerRegistryError('Сервис ГРП МНС вернул некорректный ответ', 'INVALID_RESPONSE', 502)
      }
      const taxpayer = parseTaxpayerRegistryPayload(payload)
      if (!taxpayer) {
        throw new TaxpayerRegistryError('Сервис ГРП МНС вернул некорректный ответ', 'INVALID_RESPONSE', 502)
      }
      if (taxpayer.unp !== unp) {
        throw new TaxpayerRegistryError('Сервис ГРП МНС вернул данные другого плательщика', 'INVALID_RESPONSE', 502)
      }

      if (this.cache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = this.cache.keys().next().value
        if (oldestKey) this.cache.delete(oldestKey)
      }
      this.cache.set(unp, { value: taxpayer, expiresAt: now + this.cacheTtlMs })
      return taxpayer
    } catch (error) {
      if (error instanceof TaxpayerRegistryError) throw error
      if (
        controller.signal.aborted ||
        (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
      ) {
        throw new TaxpayerRegistryError('Превышено время ожидания ответа ГРП МНС', 'TIMEOUT', 504)
      }
      throw new TaxpayerRegistryError('Сервис ГРП МНС временно недоступен', 'UPSTREAM_ERROR', 502)
    } finally {
      clearTimeout(timer)
    }
  }
}

export const taxpayerRegistryService = new TaxpayerRegistryService({
  timeoutMs: Number(process.env.TAXPAYER_REGISTRY_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  cacheTtlMs: Number(process.env.TAXPAYER_REGISTRY_CACHE_TTL_MS) || DEFAULT_CACHE_TTL_MS,
})
