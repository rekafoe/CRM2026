import { getDb } from '../config/database'
import { dispatchPostalShipment, pullPostalBlank } from './postalDispatch'
import { getPostalCarrierSettings } from './postalCarrierSettings'
import { postalCarrierTitle, type PostalCarrier } from './postalShipmentBlank'

export type PostalShipmentRow = {
  id: number
  order_id: number
  carrier: PostalCarrier
  payer: 'sender_legal'
  organization_id: number | null
  recipient_name: string
  recipient_phone: string | null
  recipient_address: string
  places: number
  weight_kg: number | null
  cod_amount: number | null
  declared_value: number | null
  tracking_number: string | null
  external_id: string | null
  document_id: string | null
  blank_status: 'none' | 'processing' | 'ready'
  carrier_message: string | null
  has_blank: boolean
  status: 'draft' | 'blank_issued' | 'handed_over'
  notes: string | null
  created_at: string
  updated_at: string
  blank_number: string
  carrier_title: string
}

type CreateInput = {
  carrier: unknown
  organization_id?: unknown
  recipient_name?: unknown
  recipient_phone?: unknown
  recipient_address?: unknown
  places?: unknown
  weight_kg?: unknown
  cod_amount?: unknown
  declared_value?: unknown
  notes?: unknown
}

const CARRIERS = new Set<PostalCarrier>(['belpost', 'europost'])

function asText(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function parseCarrier(value: unknown): PostalCarrier {
  const carrier = asText(value).toLowerCase()
  if (!CARRIERS.has(carrier as PostalCarrier)) {
    throw Object.assign(new Error('Укажите перевозчика: Белпочта или Европочта'), { status: 400 })
  }
  return carrier as PostalCarrier
}

function blankNumber(carrier: PostalCarrier, id: number): string {
  return `${carrier === 'belpost' ? 'BP' : 'EP'}-${id}`
}

const SHIPMENT_COLUMNS = `id, order_id, carrier, payer, organization_id, recipient_name, recipient_phone,
              recipient_address, places, weight_kg, cod_amount, declared_value, tracking_number,
              external_id, document_id, blank_status, carrier_message,
              CASE WHEN blank_file IS NOT NULL AND length(blank_file) > 0 THEN 1 ELSE 0 END AS has_blank,
              status, notes, created_at, updated_at`

function parseMoney(value: unknown): number | null {
  if (value == null || value === '') return null
  const amount = Number(String(value).replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * 100) / 100
}

function belpostMoney(carrier: PostalCarrier, codRaw: unknown, declaredRaw: unknown): { codAmount: number | null; declaredValue: number | null } {
  if (carrier !== 'belpost') return { codAmount: null, declaredValue: null }
  const codAmount = parseMoney(codRaw)
  let declaredValue = parseMoney(declaredRaw)
  if (codAmount != null && declaredValue == null) declaredValue = codAmount
  if (codAmount != null && declaredValue != null && codAmount > declaredValue) {
    throw Object.assign(new Error('Наложенный платёж больше объявленной ценности'), { status: 400 })
  }
  return { codAmount, declaredValue }
}

function mapRow(row: Omit<PostalShipmentRow, 'blank_number' | 'carrier_title' | 'has_blank'> & { has_blank?: number | boolean }): PostalShipmentRow {
  return {
    ...row,
    carrier: row.carrier,
    payer: 'sender_legal',
    blank_status: row.blank_status || 'none',
    has_blank: row.has_blank === true || row.has_blank === 1,
    blank_number: blankNumber(row.carrier, row.id),
    carrier_title: postalCarrierTitle(row.carrier),
  }
}

export class PostalShipmentService {
  static async list(orderId: number): Promise<PostalShipmentRow[]> {
    const db = await getDb()
    const rows = await db.all<Array<Omit<PostalShipmentRow, 'blank_number' | 'carrier_title'>>>(
      `SELECT ${SHIPMENT_COLUMNS}
         FROM postal_shipments
        WHERE order_id = ?
        ORDER BY id DESC`,
      [orderId],
    )
    return (rows || []).map(mapRow)
  }

  static async create(orderId: number, input: CreateInput): Promise<PostalShipmentRow> {
    const carrier = parseCarrier(input.carrier)
    const recipientName = asText(input.recipient_name)
    const recipientAddress = asText(input.recipient_address)
    if (!recipientName) throw Object.assign(new Error('Укажите получателя'), { status: 400 })
    if (!recipientAddress) throw Object.assign(new Error('Укажите адрес доставки'), { status: 400 })
    const places = Math.max(1, Math.floor(Number(input.places) || 1))
    const weightRaw = input.weight_kg == null || input.weight_kg === '' ? null : Number(String(input.weight_kg).replace(',', '.'))
    const weightKg = weightRaw != null && Number.isFinite(weightRaw) && weightRaw > 0 ? Math.round(weightRaw * 1000) / 1000 : null
    const { codAmount, declaredValue } = belpostMoney(carrier, input.cod_amount, input.declared_value)
    if (weightKg == null) throw Object.assign(new Error('Укажите вес, кг'), { status: 400 })
    const organizationId = Number(input.organization_id)
    const db = await getDb()
    const order = await db.get<{ id: number; number: string | null }>(
      `SELECT id, number FROM orders WHERE id = ?`,
      [orderId],
    )
    if (!order) throw Object.assign(new Error('Заказ не найден'), { status: 404 })
    const settings = await getPostalCarrierSettings(db)
    const externalRef = `crm-${orderId}-${Date.now()}`
    const dispatched = await dispatchPostalShipment({
      carrier,
      orderNumber: order.number || `№${order.id}`,
      externalRef,
      recipientName,
      recipientPhone: asText(input.recipient_phone),
      recipientAddress,
      weightKg,
      codAmount,
      declaredValue,
      notes: asText(input.notes),
    }, settings)
    const inserted = await db.run(
      `INSERT INTO postal_shipments (
         order_id, carrier, payer, organization_id, recipient_name, recipient_phone, recipient_address,
         places, weight_kg, cod_amount, declared_value, tracking_number, external_id, document_id,
         blank_status, blank_filename, blank_content_type, blank_file, carrier_message, notes, status,
         created_at, updated_at
       ) VALUES (?, ?, 'sender_legal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'blank_issued', datetime('now'), datetime('now'))`,
      [
        orderId,
        carrier,
        Number.isFinite(organizationId) && organizationId > 0 ? organizationId : null,
        recipientName,
        asText(input.recipient_phone) || null,
        recipientAddress,
        places,
        weightKg,
        codAmount,
        declaredValue,
        dispatched.trackingNumber,
        dispatched.externalId,
        dispatched.documentId,
        dispatched.file ? 'ready' : dispatched.blankStatus,
        dispatched.file ? `${carrier}-blank-${dispatched.trackingNumber || dispatched.externalId || externalRef}.${dispatched.file.extension}` : null,
        dispatched.file?.contentType ?? null,
        dispatched.file?.bytes ?? null,
        dispatched.message,
        asText(input.notes) || null,
      ],
    )
    const id = Number(inserted.lastID)
    const row = await this.get(orderId, id)
    if (!row) throw new Error('Не удалось сохранить ответ перевозчика')
    return row
  }

  static async update(
    orderId: number,
    shipmentId: number,
    input: { tracking_number?: unknown; notes?: unknown },
  ): Promise<PostalShipmentRow> {
    const existing = await this.get(orderId, shipmentId)
    if (!existing) throw Object.assign(new Error('Доставка не найдена'), { status: 404 })
    if (input.tracking_number !== undefined) {
      throw Object.assign(new Error('Трек-номер приходит только от Белпочты или Европочты'), { status: 400 })
    }
    const notes = input.notes === undefined ? existing.notes : asText(input.notes) || null
    const db = await getDb()
    await db.run(
      `UPDATE postal_shipments
          SET notes = ?, updated_at = datetime('now')
        WHERE id = ? AND order_id = ?`,
      [notes, shipmentId, orderId],
    )
    const row = await this.get(orderId, shipmentId)
    if (!row) throw new Error('Доставка не найдена')
    return row
  }

  static async get(orderId: number, shipmentId: number): Promise<PostalShipmentRow | null> {
    const db = await getDb()
    const row = await db.get<Omit<PostalShipmentRow, 'blank_number' | 'carrier_title'>>(
      `SELECT ${SHIPMENT_COLUMNS}
         FROM postal_shipments
        WHERE id = ? AND order_id = ?`,
      [shipmentId, orderId],
    )
    return row ? mapRow(row) : null
  }

  static async renderBlankPdf(orderId: number, shipmentId: number): Promise<{ pdf: Buffer; filename: string; contentType: string }> {
    const shipment = await this.get(orderId, shipmentId)
    if (!shipment) throw Object.assign(new Error('Доставка не найдена'), { status: 404 })
    const stored = await this.readStoredBlank(orderId, shipmentId)
    if (stored) return stored
    if (shipment.blank_status !== 'processing' && !shipment.document_id && !shipment.external_id) {
      throw Object.assign(new Error(shipment.carrier_message || 'Перевозчик ещё не прислал бланк'), { status: 409 })
    }
    const db = await getDb()
    const settings = await getPostalCarrierSettings(db)
    const pulled = await pullPostalBlank(shipment.carrier, {
      documentId: shipment.document_id,
      externalId: shipment.external_id,
      trackingNumber: shipment.tracking_number,
    }, settings)
    if (pulled.file) {
      const filename = `${shipment.carrier}-blank-${shipment.tracking_number || shipment.external_id || shipment.blank_number}.${pulled.file.extension}`
      await db.run(
        `UPDATE postal_shipments
            SET blank_status = 'ready',
                blank_filename = ?,
                blank_content_type = ?,
                blank_file = ?,
                carrier_message = ?,
                tracking_number = COALESCE(?, tracking_number),
                updated_at = datetime('now')
          WHERE id = ? AND order_id = ?`,
        [filename, pulled.file.contentType, pulled.file.bytes, pulled.message, pulled.trackingNumber, shipmentId, orderId],
      )
      return { pdf: pulled.file.bytes, filename, contentType: pulled.file.contentType }
    }
    await db.run(
      `UPDATE postal_shipments
          SET blank_status = 'processing', carrier_message = ?, updated_at = datetime('now')
        WHERE id = ? AND order_id = ?`,
      [pulled.message, shipmentId, orderId],
    )
    throw Object.assign(new Error(pulled.message || 'Бланк ещё формируется у перевозчика'), { status: 409 })
  }

  private static async readStoredBlank(orderId: number, shipmentId: number): Promise<{ pdf: Buffer; filename: string; contentType: string } | null> {
    const db = await getDb()
    const row = await db.get<{
      blank_file: Buffer | null
      blank_filename: string | null
      blank_content_type: string | null
      carrier: PostalCarrier
      tracking_number: string | null
    }>(
      `SELECT blank_file, blank_filename, blank_content_type, carrier, tracking_number
         FROM postal_shipments
        WHERE id = ? AND order_id = ?`,
      [shipmentId, orderId],
    )
    const bytes = row?.blank_file
    if (!bytes || bytes.length === 0) return null
    return {
      pdf: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes),
      filename: row?.blank_filename || `${row?.carrier || 'postal'}-blank-${row?.tracking_number || shipmentId}`,
      contentType: row?.blank_content_type || 'application/pdf',
    }
  }
}
