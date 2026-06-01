/**
 * Способ получения / доставка заказа с сайта.
 * providerId — стабильный id точки или провайдера на сайте (не display name).
 */
export type WebsiteDeliveryKind =
  | 'pickup'
  | 'courier_minsk'
  | 'pickup_point'
  | 'courier_country'
  | 'other'

export interface WebsiteOrderDelivery {
  kind: WebsiteDeliveryKind | string
  providerId: string
  label: string
  description?: string | null
  /** Стоимость в BYN; null если только costLabel («от 10р») */
  cost?: number | null
  costLabel?: string | null
  address?: string | null
  meta?: Record<string, unknown>
}

const KNOWN_KINDS = new Set<string>([
  'pickup',
  'courier_minsk',
  'pickup_point',
  'courier_country',
  'other',
])

export function parseWebsiteOrderDelivery(raw: unknown): WebsiteOrderDelivery | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const kind = o.kind != null ? String(o.kind).trim() : ''
  const providerId = o.providerId != null ? String(o.providerId).trim() : ''
  const label = o.label != null ? String(o.label).trim() : ''
  if (!kind || !providerId || !label) return null

  let cost: number | null | undefined
  if (o.cost === null || o.cost === '') {
    cost = null
  } else if (o.cost != null && o.cost !== undefined) {
    const n = Number(o.cost)
    cost = Number.isFinite(n) ? Math.round(n * 100) / 100 : null
  }

  const meta =
    o.meta && typeof o.meta === 'object' && !Array.isArray(o.meta)
      ? { ...(o.meta as Record<string, unknown>) }
      : undefined

  return {
    kind: KNOWN_KINDS.has(kind) ? (kind as WebsiteDeliveryKind) : kind,
    providerId,
    label,
    description: o.description != null ? String(o.description) : null,
    cost,
    costLabel: o.costLabel != null ? String(o.costLabel).trim() || null : null,
    address: o.address != null ? String(o.address).trim() || null : null,
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
  }
}

export function serializeWebsiteOrderDelivery(delivery: WebsiteOrderDelivery): string {
  return JSON.stringify(delivery)
}

export function parseWebsiteOrderDeliveryJson(json: string | null | undefined): WebsiteOrderDelivery | null {
  if (!json || !String(json).trim()) return null
  try {
    return parseWebsiteOrderDelivery(JSON.parse(json))
  } catch {
    return null
  }
}

const KIND_LABELS: Record<string, string> = {
  pickup: 'Самовывоз',
  courier_minsk: 'Курьер по Минску',
  pickup_point: 'Пункт выдачи',
  courier_country: 'Доставка по Беларуси',
  other: 'Доставка',
}

export function formatWebsiteDeliverySummary(delivery: WebsiteOrderDelivery): string {
  const kindLabel = KIND_LABELS[delivery.kind] ?? delivery.kind
  const costPart =
    delivery.cost != null && Number.isFinite(delivery.cost)
      ? `${delivery.cost.toFixed(2)} BYN`
      : delivery.costLabel ?? null
  const parts = [kindLabel, delivery.label]
  if (costPart) parts.push(costPart)
  return parts.filter(Boolean).join(' · ')
}
