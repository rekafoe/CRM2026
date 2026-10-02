import { getDb } from '../config/database'
import { PDFReportService } from './pdfReportService'
import {
  buildPostalBlankHtml,
  postalCarrierTitle,
  type PostalBlankData,
  type PostalCarrier,
} from './postalShipmentBlank'

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
  tracking_number: string | null
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

function mapRow(row: Omit<PostalShipmentRow, 'blank_number' | 'carrier_title'>): PostalShipmentRow {
  return {
    ...row,
    carrier: row.carrier,
    payer: 'sender_legal',
    blank_number: blankNumber(row.carrier, row.id),
    carrier_title: postalCarrierTitle(row.carrier),
  }
}

export class PostalShipmentService {
  static async list(orderId: number): Promise<PostalShipmentRow[]> {
    const db = await getDb()
    const rows = await db.all<Array<Omit<PostalShipmentRow, 'blank_number' | 'carrier_title'>>>(
      `SELECT id, order_id, carrier, payer, organization_id, recipient_name, recipient_phone,
              recipient_address, places, weight_kg, tracking_number, status, notes, created_at, updated_at
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
    const organizationId = Number(input.organization_id)
    const db = await getDb()
    const inserted = await db.run(
      `INSERT INTO postal_shipments (
         order_id, carrier, payer, organization_id, recipient_name, recipient_phone, recipient_address,
         places, weight_kg, notes, status, created_at, updated_at
       ) VALUES (?, ?, 'sender_legal', ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'), datetime('now'))`,
      [
        orderId,
        carrier,
        Number.isFinite(organizationId) && organizationId > 0 ? organizationId : null,
        recipientName,
        asText(input.recipient_phone) || null,
        recipientAddress,
        places,
        weightKg,
        asText(input.notes) || null,
      ],
    )
    const id = Number(inserted.lastID)
    const row = await this.get(orderId, id)
    if (!row) throw new Error('Не удалось сохранить доставку')
    return row
  }

  static async update(
    orderId: number,
    shipmentId: number,
    input: { tracking_number?: unknown; notes?: unknown },
  ): Promise<PostalShipmentRow> {
    const existing = await this.get(orderId, shipmentId)
    if (!existing) throw Object.assign(new Error('Доставка не найдена'), { status: 404 })
    const tracking = input.tracking_number === undefined ? existing.tracking_number : asText(input.tracking_number) || null
    const notes = input.notes === undefined ? existing.notes : asText(input.notes) || null
    const status = tracking ? 'handed_over' : existing.status
    const db = await getDb()
    await db.run(
      `UPDATE postal_shipments
          SET tracking_number = ?, notes = ?, status = ?, updated_at = datetime('now')
        WHERE id = ? AND order_id = ?`,
      [tracking, notes, status, shipmentId, orderId],
    )
    const row = await this.get(orderId, shipmentId)
    if (!row) throw new Error('Доставка не найдена')
    return row
  }

  static async get(orderId: number, shipmentId: number): Promise<PostalShipmentRow | null> {
    const db = await getDb()
    const row = await db.get<Omit<PostalShipmentRow, 'blank_number' | 'carrier_title'>>(
      `SELECT id, order_id, carrier, payer, organization_id, recipient_name, recipient_phone,
              recipient_address, places, weight_kg, tracking_number, status, notes, created_at, updated_at
         FROM postal_shipments
        WHERE id = ? AND order_id = ?`,
      [shipmentId, orderId],
    )
    return row ? mapRow(row) : null
  }

  static async markBlankIssued(orderId: number, shipmentId: number): Promise<void> {
    const db = await getDb()
    await db.run(
      `UPDATE postal_shipments
          SET status = CASE WHEN status = 'handed_over' THEN status ELSE 'blank_issued' END,
              updated_at = datetime('now')
        WHERE id = ? AND order_id = ?`,
      [shipmentId, orderId],
    )
  }

  static async buildBlankData(orderId: number, shipmentId: number): Promise<PostalBlankData> {
    const shipment = await this.get(orderId, shipmentId)
    if (!shipment) throw Object.assign(new Error('Доставка не найдена'), { status: 404 })
    const db = await getDb()
    const order = await db.get<{
      id: number
      number: string | null
      customerName: string | null
    }>(
      `SELECT id, number, customerName FROM orders WHERE id = ?`,
      [orderId],
    )
    if (!order) throw Object.assign(new Error('Заказ не найден'), { status: 404 })

    let organization: {
      name?: string | null
      unp?: string | null
      legal_address?: string | null
      phone?: string | null
      bank_details?: string | null
    } | null = null
    if (shipment.organization_id) {
      organization = await db.get(
        `SELECT name, unp, legal_address, phone, bank_details FROM organizations WHERE id = ?`,
        [shipment.organization_id],
      )
    }
    if (!organization) {
      organization = await db.get(
        `SELECT name, unp, legal_address, phone, bank_details
           FROM organizations
          ORDER BY is_default DESC, sort_order ASC, id ASC
          LIMIT 1`,
      )
    }

    const items = await db.all<Array<{ type: string; params: string; quantity: number }>>(
      `SELECT type, params, quantity FROM items WHERE orderId = ? ORDER BY id`,
      [orderId],
    )
    const itemLines = (items || []).slice(0, 12).map((item) => {
      let name = item.type
      try {
        const params = JSON.parse(item.params || '{}')
        name = String(params.productName || params.customName || params.name || params.description || item.type)
      } catch {
        name = item.type
      }
      const qty = Math.max(1, Number(item.quantity) || 1)
      return `${name} × ${qty}`
    })

    return {
      blankNumber: shipment.blank_number,
      carrier: shipment.carrier,
      orderNumber: order.number || `№${order.id}`,
      recipientName: shipment.recipient_name,
      recipientPhone: shipment.recipient_phone || '',
      recipientAddress: shipment.recipient_address,
      places: shipment.places,
      weightKg: shipment.weight_kg,
      notes: shipment.notes || '',
      trackingNumber: shipment.tracking_number || '',
      senderName: organization?.name || 'Организация',
      senderUnp: organization?.unp || '',
      senderAddress: organization?.legal_address || '',
      senderPhone: organization?.phone || '',
      senderBank: organization?.bank_details || '',
      itemLines,
    }
  }

  static async renderBlankPdf(orderId: number, shipmentId: number): Promise<{ pdf: Buffer; filename: string }> {
    const data = await this.buildBlankData(orderId, shipmentId)
    const pdf = await PDFReportService.renderHtmlPdf(buildPostalBlankHtml(data))
    await this.markBlankIssued(orderId, shipmentId)
    const filename = data.carrier === 'europost'
      ? `europost-nakladnaya-${data.blankNumber}.pdf`
      : `belpost-f116-${data.blankNumber}.pdf`
    return { pdf, filename }
  }
}
