/**
 * Срок готовности заказа (Order Pool, readyDate, письма).
 *
 * На сайте «Срочно» = 1–3 часа, но в заказ часто уходит ключ `standard`
 * (лейбл сайта), а не `urgent`. Для website/mini_app считаем standard как срочный SLA.
 */

export type ReadySlaSource = 'crm' | 'website' | 'telegram' | 'mini_app' | string | null | undefined

export type ReadySlaItem = {
  type?: string | null
  params?: unknown
  priceType?: unknown
  price_type?: string | null
}

export const HOUR_SLA_MS = 3 * 60 * 60 * 1000
export const DAY_SLA_MS = 24 * 60 * 60 * 1000
export const TWO_DAY_SLA_MS = 48 * 60 * 60 * 1000
export const SPECIAL_SLA_MS = 5 * 24 * 60 * 60 * 1000

export const READY_LABELS: Record<string, string> = {
  urgent: '1–3 часа',
  promo: '48 часов',
  special: '4–5 дней',
  standard: '24 часа',
  online: '24 часа',
}

const CRM_OFFSET_MS: Record<string, number> = {
  urgent: HOUR_SLA_MS,
  promo: TWO_DAY_SLA_MS,
  special: SPECIAL_SLA_MS,
  standard: DAY_SLA_MS,
  online: DAY_SLA_MS,
}

const WEBSITE_OFFSET_MS: Record<string, number> = {
  urgent: HOUR_SLA_MS,
  standard: HOUR_SLA_MS,
  promo: TWO_DAY_SLA_MS,
  special: TWO_DAY_SLA_MS,
  online: TWO_DAY_SLA_MS,
}

const WEBSITE_LABELS: Record<string, string> = {
  urgent: '1–3 часа',
  standard: '1–3 часа',
  promo: '48 часов',
  special: '48 часов',
  online: '48 часов',
}

const PHOTO_PAPER = new Set(['glossy', 'matte', 'glossy_paper', 'matte_paper'])

export function isWebsiteLikeSource(source: ReadySlaSource): boolean {
  return source === 'website' || source === 'mini_app'
}

export function parseItemParams(params: unknown): Record<string, unknown> {
  if (params == null) return {}
  if (typeof params === 'object' && !Array.isArray(params)) {
    return params as Record<string, unknown>
  }
  if (typeof params === 'string') {
    const s = params.trim()
    if (!s) return {}
    try {
      const parsed = JSON.parse(s) as unknown
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  return {}
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function readPriceTypeField(obj: Record<string, unknown> | null | undefined): string | null {
  if (!obj) return null
  const candidates = [obj.priceType, obj.price_type, obj.pricingType, obj.urgency]
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
  }
  return null
}

export function normalizePriceTypeKey(raw: unknown): string {
  const key = String(raw ?? '')
    .toLowerCase()
    .trim()
  if (!key) return 'standard'
  if (
    key === 'rush' ||
    key === 'express' ||
    key === 'superurgent' ||
    key === 'super_urgent' ||
    key === 'срочно'
  ) {
    return 'urgent'
  }
  if (key === 'онлайн') return 'online'
  if (key === 'промо') return 'promo'
  return key
}

export function extractRawPriceType(item: ReadySlaItem): string | null {
  const params = parseItemParams(item.params)
  const specs = asRecord(params.specifications)
  const config = asRecord(params.configuration)
  const raw =
    (typeof item.priceType === 'string' && item.priceType.trim() ? item.priceType : null) ??
    (typeof item.price_type === 'string' && item.price_type.trim() ? item.price_type : null) ??
    readPriceTypeField(params) ??
    readPriceTypeField(specs) ??
    readPriceTypeField(config)
  return raw && raw.trim() ? raw.trim() : null
}

export function extractPriceTypeKey(item: ReadySlaItem): string {
  return normalizePriceTypeKey(extractRawPriceType(item))
}

function photoSlaKey(item: ReadySlaItem): string | null {
  const params = parseItemParams(item.params)
  const specs = asRecord(params.specifications)
  const printType = String(specs?.printType ?? '').toLowerCase().trim()
  if (printType === 'premium') return 'urgent'
  if (printType === 'digital') return 'promo'
  const productType = String(specs?.productType ?? params.productType ?? '')
    .toLowerCase()
    .trim()
  if (productType === 'polaroid') return 'promo'
  const paper = String(specs?.paperType ?? '').toLowerCase().trim()
  if (specs && Object.prototype.hasOwnProperty.call(specs, 'withWhiteBorders') && PHOTO_PAPER.has(paper)) {
    return 'promo'
  }
  return null
}

function slaTable(source: ReadySlaSource): {
  offsets: Record<string, number>
  labels: Record<string, string>
} {
  if (isWebsiteLikeSource(source)) {
    return { offsets: WEBSITE_OFFSET_MS, labels: WEBSITE_LABELS }
  }
  return { offsets: CRM_OFFSET_MS, labels: READY_LABELS }
}

export function getItemSlaKey(item: ReadySlaItem, source?: ReadySlaSource): string {
  const fromPhoto = photoSlaKey(item)
  if (fromPhoto) return fromPhoto
  const raw = extractRawPriceType(item)
  if (!raw) return isWebsiteLikeSource(source) ? 'online' : 'standard'
  return normalizePriceTypeKey(raw)
}

export function getItemReadyOffsetMs(item: ReadySlaItem, source?: ReadySlaSource): number {
  const key = getItemSlaKey(item, source)
  const { offsets } = slaTable(source)
  return offsets[key] ?? (isWebsiteLikeSource(source) ? TWO_DAY_SLA_MS : DAY_SLA_MS)
}

export function getItemReadyLabel(item: ReadySlaItem, source?: ReadySlaSource): string {
  const key = getItemSlaKey(item, source)
  const { labels } = slaTable(source)
  return labels[key] ?? (isWebsiteLikeSource(source) ? WEBSITE_LABELS.online : READY_LABELS.standard)
}

export function getOrderGoverningSla(
  items: ReadySlaItem[] | null | undefined,
  source?: ReadySlaSource
): { key: string; offsetMs: number; label: string } {
  const list = Array.isArray(items) && items.length > 0 ? items : [{}]
  let best = {
    key: getItemSlaKey(list[0], source),
    offsetMs: getItemReadyOffsetMs(list[0], source),
    label: getItemReadyLabel(list[0], source),
  }
  for (const item of list.slice(1)) {
    const offsetMs = getItemReadyOffsetMs(item, source)
    if (offsetMs >= best.offsetMs) {
      best = {
        key: getItemSlaKey(item, source),
        offsetMs,
        label: getItemReadyLabel(item, source),
      }
    }
  }
  return best
}

/**
 * Парсит readyDate из params.
 * Строки без таймзоны (YYYY-MM-DDTHH:mm) раньше писались в UTC сервера —
 * интерпретируем их как UTC, иначе в UTC+3 готовность «уезжает» назад.
 */
export function parseItemReadyDateMs(raw: unknown): number {
  if (raw == null) return NaN
  const s = String(raw).trim()
  if (!s) return NaN
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const utc = Date.parse(s.length === 16 ? `${s}:00Z` : `${s}Z`)
    if (Number.isFinite(utc)) return utc
  }
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? t : NaN
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

export function resolveItemReadyMs(
  item: ReadySlaItem,
  createdMs: number,
  source?: ReadySlaSource
): number | null {
  const offset = getItemReadyOffsetMs(item, source)
  const fromSla = Number.isFinite(createdMs) ? createdMs + offset : NaN
  const params = parseItemParams(item.params)
  const stored = parseItemReadyDateMs(params.readyDate)

  if (!Number.isFinite(stored)) {
    return Number.isFinite(fromSla) ? fromSla : null
  }
  if (Number.isFinite(createdMs) && stored < createdMs) {
    return Number.isFinite(fromSla) ? fromSla : stored
  }
  if (Number.isFinite(createdMs) && Number.isFinite(fromSla)) {
    const delta = stored - createdMs
    // Срочный SLA в часах, а в позиции лежит «+1 день» из production_days
    if (offset <= SIX_HOURS_MS && delta >= SIX_HOURS_MS) {
      return fromSla
    }
    // Старый бэкенд писал +1ч без таймзоны при подписи «24 часа»
    if (offset >= DAY_SLA_MS && delta < TWO_HOURS_MS) {
      return fromSla
    }
  }
  return stored
}

export function resolveOrderReadyAtMs(order: {
  created_at?: string | null
  createdAt?: string | null
  source?: ReadySlaSource
  items?: ReadySlaItem[] | null
}): number | null {
  const created = order.created_at ?? order.createdAt
  const createdMs = created ? new Date(created).getTime() : NaN
  const source = order.source
  const items = order.items ?? []

  const fromItems = items
    .map((item) => resolveItemReadyMs(item, createdMs, source))
    .filter((t): t is number => t != null && Number.isFinite(t))

  if (fromItems.length > 0) {
    return Math.max(...fromItems)
  }

  const sla = getOrderGoverningSla(items, source)
  if (!Number.isFinite(createdMs)) return null
  return createdMs + sla.offsetMs
}

export function buildDefaultReadyDateIso(
  baseDate: string | undefined,
  item: ReadySlaItem,
  source?: ReadySlaSource
): string | null {
  const date = baseDate ? new Date(baseDate) : new Date()
  if (Number.isNaN(date.getTime())) return null
  const offset = getItemReadyOffsetMs(item, source)
  return new Date(date.getTime() + offset).toISOString()
}
