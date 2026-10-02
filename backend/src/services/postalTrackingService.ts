import { getDb } from '../config/database'
import { fetchBelpostTracking } from './belpostGateway'
import { fetchEuropostTracking } from './europostGateway'
import { latestTrackingEvent, type TrackingEvent } from './postalCarrierParse'
import { europostReady, getPostalCarrierSettings, missingEuropostMessage } from './postalCarrierSettings'
import { postalCarrierTitle, type PostalCarrier } from './postalShipmentBlank'

export type TrackingCarrierFilter = 'all' | PostalCarrier

const BELPOST_REFRESH_LIMIT = 5

export type PostalTrackingEventRow = TrackingEvent & { id: number }

export type PostalTrackingShipment = {
  id: number
  order_id: number
  order_number: string
  customer_name: string
  carrier: PostalCarrier
  carrier_title: string
  recipient_name: string
  recipient_address: string
  tracking_number: string | null
  tracking_checked_at: string | null
  tracking_error: string | null
  current_status: string
  current_place: string
  current_at: string | null
  events: PostalTrackingEventRow[]
}

type ShipmentRow = {
  id: number
  order_id: number
  order_number: string | null
  customer_name: string | null
  carrier: PostalCarrier
  recipient_name: string
  recipient_address: string
  tracking_number: string | null
  external_id: string | null
  document_id: string | null
  tracking_checked_at: string | null
  tracking_error: string | null
}

function currentStatus(row: ShipmentRow, latest: TrackingEvent | null): string {
  if (latest?.title) return latest.title
  if (row.tracking_error) return row.tracking_error
  if (row.tracking_number) return 'Событий ещё нет'
  return 'Трек ещё не пришёл'
}

async function loadShipments(carrier: TrackingCarrierFilter, shipmentId?: number): Promise<ShipmentRow[]> {
  const db = await getDb()
  const where: string[] = []
  const params: Array<string | number> = []
  if (shipmentId) {
    where.push('s.id = ?')
    params.push(shipmentId)
  } else if (carrier !== 'all') {
    where.push('s.carrier = ?')
    params.push(carrier)
  }
  const rows = await db.all<ShipmentRow[]>(
    `SELECT s.id, s.order_id, o.number AS order_number, o.customerName AS customer_name,
            s.carrier, s.recipient_name, s.recipient_address, s.tracking_number,
            s.external_id, s.document_id, s.tracking_checked_at, s.tracking_error
       FROM postal_shipments s
       LEFT JOIN orders o ON o.id = s.order_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY s.id DESC`,
    params,
  )
  return rows || []
}

async function loadEvents(shipmentIds: number[]): Promise<Map<number, PostalTrackingEventRow[]>> {
  const grouped = new Map<number, PostalTrackingEventRow[]>()
  if (shipmentIds.length === 0) return grouped
  const db = await getDb()
  const rows = await db.all<Array<PostalTrackingEventRow & { shipment_id: number }>>(
    `SELECT id, shipment_id, event_key AS eventKey, event_at AS eventAt, code, title, place
       FROM postal_tracking_events
      WHERE shipment_id IN (${shipmentIds.map(() => '?').join(',')})
      ORDER BY event_at, id`,
    shipmentIds,
  )
  for (const row of rows || []) {
    const list = grouped.get(row.shipment_id) || []
    list.push({
      id: row.id,
      eventKey: row.eventKey,
      eventAt: row.eventAt,
      code: row.code || '',
      title: row.title,
      place: row.place || '',
    })
    grouped.set(row.shipment_id, list)
  }
  return grouped
}

function present(row: ShipmentRow, events: PostalTrackingEventRow[]): PostalTrackingShipment {
  const latest = latestTrackingEvent(events)
  return {
    id: row.id,
    order_id: row.order_id,
    order_number: row.order_number || `№${row.order_id}`,
    customer_name: row.customer_name || '',
    carrier: row.carrier,
    carrier_title: postalCarrierTitle(row.carrier),
    recipient_name: row.recipient_name,
    recipient_address: row.recipient_address,
    tracking_number: row.tracking_number,
    tracking_checked_at: row.tracking_checked_at,
    tracking_error: row.tracking_error,
    current_status: currentStatus(row, latest),
    current_place: latest?.place || '',
    current_at: latest?.eventAt || null,
    events,
  }
}

export async function listPostalTracking(carrier: TrackingCarrierFilter): Promise<PostalTrackingShipment[]> {
  const rows = await loadShipments(carrier)
  const events = await loadEvents(rows.map((row) => row.id))
  return rows.map((row) => present(row, events.get(row.id) || []))
}

async function storeEvents(shipmentId: number, events: TrackingEvent[], error: string | null): Promise<void> {
  const db = await getDb()
  for (const event of events) {
    await db.run(
      `INSERT OR IGNORE INTO postal_tracking_events (shipment_id, event_key, event_at, code, title, place, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [shipmentId, event.eventKey, event.eventAt, event.code || null, event.title, event.place || null],
    )
  }
  await db.run(
    `UPDATE postal_shipments
        SET tracking_checked_at = datetime('now'),
            tracking_error = ?,
            updated_at = datetime('now')
      WHERE id = ?`,
    [error, shipmentId],
  )
}

export async function refreshPostalTracking(input: {
  carrier: TrackingCarrierFilter
  shipmentId?: number
}): Promise<{ shipments: PostalTrackingShipment[]; updated: number; message: string }> {
  const rows = await loadShipments(input.shipmentId ? 'all' : input.carrier, input.shipmentId)
  const settings = await getPostalCarrierSettings()
  let updated = 0
  let belpostCalls = 0
  let stopped = ''
  for (const row of rows) {
    if (!row.tracking_number) continue
    if (row.carrier === 'belpost') {
      if (!input.shipmentId && belpostCalls >= BELPOST_REFRESH_LIMIT) {
        stopped = 'Белпочта ограничивает частоту отслеживания, за один раз обновлены первые 5 отправлений. Остальные можно обновить по одному.'
        break
      }
      belpostCalls += 1
      try {
        const events = await fetchBelpostTracking(row.tracking_number, settings)
        const emptyNote = events.length === 0 && !(await hasEvents(row.id))
          ? 'Белпочта ещё не передала события по этому номеру'
          : null
        await storeEvents(row.id, events, emptyNote)
        updated += 1
      } catch (error: any) {
        const message = error?.message || 'Белпочта не отдала статус'
        await storeEvents(row.id, [], message)
        if (error?.status === 429) {
          stopped = message
          break
        }
      }
      continue
    }
    if (!europostReady(settings)) {
      await storeEvents(row.id, [], missingEuropostMessage())
      continue
    }
    try {
      const events = await fetchEuropostTracking(row.tracking_number, row.external_id || row.document_id, settings)
      const emptyNote = events.length === 0 && !(await hasEvents(row.id))
        ? 'Европочта ещё не передала события по этому номеру'
        : null
      await storeEvents(row.id, events, emptyNote)
      updated += 1
    } catch (error: any) {
      await storeEvents(row.id, [], error?.message || 'Европочта не отдала статус')
    }
  }
  const shipments = await listPostalTracking(input.carrier)
  const withTrack = rows.filter((row) => row.tracking_number).length
  const message = stopped
    || (withTrack === 0 ? 'У этих доставок ещё нет номера для отслеживания.' : `Обновлено ${updated}.`)
  return { shipments, updated, message }
}

async function hasEvents(shipmentId: number): Promise<boolean> {
  const db = await getDb()
  const row = await db.get<{ c: number }>(
    'SELECT COUNT(*) AS c FROM postal_tracking_events WHERE shipment_id = ?',
    [shipmentId],
  )
  return Number(row?.c || 0) > 0
}
