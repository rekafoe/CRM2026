import { OrderRepository } from '../repositories/orderRepository'
import { computeOrderAmounts } from '../utils/orderAmounts'
import {
  formatWebsiteDeliverySummary,
  parseWebsiteOrderDeliveryJson,
} from '../types/websiteOrderDelivery'
import { hasColumn } from '../utils/tableSchemaCache'
import { getDb } from '../config/database'

const READY_LABELS: Record<string, string> = {
  urgent: 'В течение 3 часов',
  promo: '48 часов',
  special: '4–5 дней',
  standard: '24 часа',
  online: '24 часа',
}

const READY_OFFSET_MS: Record<string, number> = {
  urgent: 3 * 60 * 60 * 1000,
  promo: 48 * 60 * 60 * 1000,
  special: 5 * 24 * 60 * 60 * 1000,
  standard: 24 * 60 * 60 * 1000,
  online: 24 * 60 * 60 * 1000,
}

function formatMoneyByn(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} BYN`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDateTimeRu(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}.${month}.${year} ${hours}:${minutes}`
}

function getPriceType(params: Record<string, unknown> | null | undefined): string {
  const raw = params?.priceType ?? params?.price_type ?? 'standard'
  return String(raw || 'standard').toLowerCase().trim()
}

function getItemLineTotal(item: {
  price?: number
  quantity?: number
  params?: Record<string, unknown>
}): number {
  const stored = item.params?.storedTotalCost
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored
  const q = Math.max(1, Number(item.quantity) || 1)
  return Math.round((Number(item.price) || 0) * q * 100) / 100
}

function parseReadyDateMs(raw: unknown): number {
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

/** Краткая фраза статуса для темы/первого абзаца. */
export function buildStatusPhrase(statusName: string): string {
  const n = String(statusName || '').trim().toLowerCase()
  if (!n) return 'обновлён'
  if (n.includes('отмен')) return 'отменён'
  if (n.includes('готов') || n.includes('выполнен') || n.includes('выдан')) return 'готов к выдаче'
  if (
    n.includes('оформлен') ||
    n.includes('ожидает') ||
    n.includes('в работе') ||
    n.includes('принят') ||
    n.includes('новый') ||
    n.includes('печат')
  ) {
    return 'принят в работу'
  }
  return `переведён в статус «${statusName}»`
}

export async function buildOrderStatusEmailVars(params: {
  orderId: number
  statusName: string
}): Promise<Record<string, string>> {
  const db = await getDb()
  let hasDelivery = false
  try {
    hasDelivery = await hasColumn('orders', 'delivery_json')
  } catch {
    hasDelivery = false
  }

  const order = await db.get<{
    id: number
    number: string | null
    customerName: string | null
    customerEmail: string | null
    customerPhone: string | null
    created_at: string | null
    delivery_json?: string | null
    source: string | null
    discount_percent?: number | null
  }>(
    `SELECT
       o.id,
       CASE WHEN o.source = 'website' THEN 'site-ord-' || o.id ELSE o.number END as number,
       o.customerName,
       o.customerEmail,
       o.customerPhone,
       COALESCE(o.created_at, o.createdAt) as created_at,
       ${hasDelivery ? 'o.delivery_json' : 'NULL as delivery_json'},
       o.source,
       COALESCE(o.discount_percent, 0) as discount_percent
     FROM orders o
     WHERE o.id = ?`,
    [params.orderId]
  )

  const items = await OrderRepository.getItemsByOrderId(params.orderId)
  const amounts = computeOrderAmounts({
    items,
    discount_percent: order?.discount_percent ?? 0,
  })

  const customerName = (order?.customerName || '').trim() || 'клиент'
  const orderNumber = (order?.number || `site-ord-${params.orderId}`).trim()
  const statusName = params.statusName
  const statusPhrase = buildStatusPhrase(statusName)

  const createdMs = order?.created_at ? new Date(order.created_at).getTime() : NaN
  let maxReadyMs = NaN
  let maxSlaLabel = READY_LABELS.standard
  let maxOffset = READY_OFFSET_MS.standard

  const itemLines: string[] = []
  for (const item of items) {
    const paramsObj = (item.params || {}) as Record<string, unknown>
    const qty = Math.max(1, Number(item.quantity) || 1)
    const title = String(item.type || 'Позиция').trim() || 'Позиция'
    const lineTotal = getItemLineTotal({
      price: item.price,
      quantity: item.quantity,
      params: paramsObj,
    })
    const priceType = getPriceType(paramsObj)
    const sla = READY_LABELS[priceType] ?? READY_LABELS.standard
    const offset = READY_OFFSET_MS[priceType] ?? READY_OFFSET_MS.standard
    if (offset >= maxOffset) {
      maxOffset = offset
      maxSlaLabel = sla
    }
    const readyRaw = paramsObj.readyDate
    const readyMs = parseReadyDateMs(readyRaw)
    if (Number.isFinite(readyMs) && (!Number.isFinite(maxReadyMs) || readyMs > maxReadyMs)) {
      maxReadyMs = readyMs
    }
    itemLines.push(`${qty} × ${title} = ${formatMoneyByn(lineTotal)}, ${sla}`)
  }

  if (!Number.isFinite(maxReadyMs) && Number.isFinite(createdMs)) {
    maxReadyMs = createdMs + maxOffset
  }

  const itemsText = itemLines.length ? itemLines.join('\n') : '—'
  const itemsHtml = itemLines.length
    ? `<ul>${itemLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
    : '<p>—</p>'

  const delivery = parseWebsiteOrderDeliveryJson(order?.delivery_json ?? null)
  const deliveryMethod = delivery ? formatWebsiteDeliverySummary(delivery) : 'Не указан'
  const deliveryHtml = escapeHtml(deliveryMethod)

  let org = await db.get<{
    name?: string | null
    phone?: string | null
    email?: string | null
  }>('SELECT name, phone, email FROM organizations WHERE is_default = 1 LIMIT 1').catch(() => null)
  if (!org) {
    org = await db
      .get<{ name?: string | null; phone?: string | null; email?: string | null }>(
        'SELECT name, phone, email FROM organizations ORDER BY id LIMIT 1'
      )
      .catch(() => null)
  }

  const site = (
    process.env.PUBLIC_WEBSITE_URL ||
    process.env.WEBSITE_PUBLIC_URL ||
    'https://printcore.by'
  ).replace(/\/$/, '')
  const cabinetUrl = (process.env.PUBLIC_CABINET_URL || `${site}/cabinet`).replace(/\/$/, '')

  const companyName = (org?.name || process.env.COMPANY_NAME || 'PrintCore').trim()
  const companyEmail = (org?.email || process.env.COMPANY_EMAIL || process.env.SMTP_FROM || '').trim()
  const companyPhone = (org?.phone || process.env.COMPANY_PHONE || '').trim()

  return {
    orderId: String(params.orderId),
    orderNumber,
    statusName,
    statusPhrase,
    customerName,
    customerPhone: (order?.customerPhone || '').trim(),
    customerEmail: (order?.customerEmail || '').trim(),
    itemsText,
    itemsHtml,
    orderTotal: formatMoneyByn(amounts.totalAmount),
    orderSubtotal: formatMoneyByn(amounts.subtotal),
    deliveryMethod,
    deliveryHtml,
    productionTerm: maxSlaLabel,
    readyAt: Number.isFinite(maxReadyMs) ? formatDateTimeRu(new Date(maxReadyMs)) : '—',
    companyName,
    companyEmail,
    companyPhone,
    companySite: site.replace(/^https?:\/\//, ''),
    companySiteUrl: site,
    cabinetUrl,
  }
}
