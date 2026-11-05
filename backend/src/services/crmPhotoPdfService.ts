import { getDb } from '../config/database'
import { registerExternalOrderFiles, updateExternalOrderFile } from './externalOrderFilesService'
import { createPhotoSra3PdfBlobV2 } from '../photoPrint/photoSra3PdfV2'
import { fetchMockupRasterBlob } from '../photoPrint/fetchMockupRaster'
import { planCrmStandardPdfParts, type CrmStandardPdfPart } from '../photoPrint/planCrmStandardPdf'
import { uploadOrderPdfToS3, orderFileS3Key } from '../photoPrint/orderFileS3Put'
import type { SavedOrder } from '../photoPrint/photoPrintTypes'
import { logger } from '../utils/logger'

const activeOrderIds = new Set<number>()

const CRM_FILE_METADATA = { origin: 'crm' }

export class CrmPhotoPdfError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'CrmPhotoPdfError'
    this.status = status
  }
}

function asOrders(value: unknown): SavedOrder[] {
  if (!Array.isArray(value)) {
    throw new CrmPhotoPdfError(400, 'Передайте orders: снимок фотозаказа')
  }
  return value.filter((order) => order && typeof order === 'object') as SavedOrder[]
}

function metadataOriginCrm(metadata: unknown): boolean {
  if (!metadata) return false
  try {
    const parsed = typeof metadata === 'string' ? JSON.parse(metadata) : metadata
    return Boolean(parsed && typeof parsed === 'object' && (parsed as { origin?: unknown }).origin === 'crm')
  } catch {
    return false
  }
}

async function readyCrmFilenames(orderId: number): Promise<Set<string>> {
  const db = await getDb()
  const rows = await db.all<Array<{ filename?: string; externalStatus?: string; metadata?: string }>>(
    'SELECT filename, externalStatus, metadata FROM order_files WHERE orderId = ?',
    orderId
  )
  const ready = new Set<string>()
  for (const row of rows) {
    const filename = String(row.filename || '')
    if (row.externalStatus !== 'ready') continue
    if (metadataOriginCrm(row.metadata) || /_crm\.pdf$/i.test(filename)) ready.add(filename)
  }
  return ready
}

async function assertWebsiteOrder(orderId: number): Promise<void> {
  const db = await getDb()
  const order = await db.get('SELECT id, source FROM orders WHERE id = ?', orderId) as {
    id: number
    source?: string | null
  } | undefined
  if (!order) throw new CrmPhotoPdfError(404, 'Заказ не найден')
  // Sibling website file routes require source=website for the shared API key.
  // Without this check the key could plant production PDFs on CRM/mini_app orders.
  if (String(order.source || '') !== 'website') {
    throw new CrmPhotoPdfError(
      403,
      'Сборка CRM PDF по API-ключу сайта разрешена только для заказов с сайта',
    )
  }
}

async function registerPart(orderId: number, part: CrmStandardPdfPart, status: string, extra: Record<string, unknown> = {}) {
  const rows = await registerExternalOrderFiles({
    orderId,
    files: [{
      storage: 's3',
      provider: process.env.ORDER_FILES_S3_PROVIDER?.trim() || 's3',
      bucket: process.env.ORDER_FILES_S3_BUCKET?.trim() || null,
      key: orderFileS3Key(orderId, part.filename),
      filename: part.filename,
      mime: 'application/pdf',
      status,
      artifactType: 'sra3_pdf',
      ...(part.partNumber != null ? { partNumber: part.partNumber } : {}),
      metadata: CRM_FILE_METADATA,
      ...extra,
    }],
  })
  const id = Number(rows[0]?.id)
  if (!Number.isFinite(id)) throw new Error('CRM не зарегистрировала файл')
  return id
}

async function buildOrder(orderId: number, parts: CrmStandardPdfPart[]): Promise<void> {
  try {
    const ready = await readyCrmFilenames(orderId)
    const pending = parts.filter((part) => !ready.has(part.filename))
    // Do not abort the whole batch on one part failure: startCrmPhotoPdf already
    // registered every pending part as processing («Готовится»). Throwing here
    // left unattempted siblings stuck in processing forever until a manual retry.
    for (const part of pending) {
      const fileId = await registerPart(orderId, part, 'processing')
      try {
        const blob = await createPhotoSra3PdfBlobV2(part.orders, {
          rasterEmbed: 'node',
          resolveMockupImage: (mockupId) => fetchMockupRasterBlob(mockupId),
        })
        const body = Buffer.from(await blob.arrayBuffer())
        const uploaded = await uploadOrderPdfToS3({ crmOrderId: orderId, filename: part.filename, body })
        await updateExternalOrderFile({
          orderId,
          fileId,
          data: {
            url: uploaded.url,
            bucket: uploaded.bucket,
            key: uploaded.key,
            size: uploaded.size,
            checksum: uploaded.checksum,
            status: 'ready',
            metadata: CRM_FILE_METADATA,
          },
        })
        logger.info('CRM photo PDF ready', { orderId, filename: part.filename, bytes: uploaded.size })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await updateExternalOrderFile({
          orderId,
          fileId,
          data: { status: 'failed', metadata: { ...CRM_FILE_METADATA, error: message.slice(0, 500) } },
        }).catch(() => undefined)
        logger.error('CRM photo PDF part failed', { orderId, filename: part.filename, message })
      }
    }
  } finally {
    activeOrderIds.delete(orderId)
  }
}

export async function startCrmPhotoPdf(
  orderId: number,
  rawOrders: unknown
): Promise<{ started: boolean; count: number; alreadyRunning: boolean }> {
  await assertWebsiteOrder(orderId)
  const orders = asOrders(rawOrders)
  const parts = planCrmStandardPdfParts(orders)
  if (parts.length === 0) return { started: false, count: 0, alreadyRunning: false }
  if (activeOrderIds.has(orderId)) return { started: false, count: 0, alreadyRunning: true }
  activeOrderIds.add(orderId)

  try {
    const ready = await readyCrmFilenames(orderId)
    const pending = parts.filter((part) => !ready.has(part.filename))
    if (pending.length === 0) {
      activeOrderIds.delete(orderId)
      return { started: false, count: 0, alreadyRunning: false }
    }

    for (const part of pending) {
      await registerPart(orderId, part, 'processing')
    }

    void buildOrder(orderId, parts).catch((error) => {
      logger.error('CRM photo PDF failed', {
        orderId,
        message: error instanceof Error ? error.message : String(error),
      })
    })
    return { started: true, count: pending.length, alreadyRunning: false }
  } catch (error) {
    activeOrderIds.delete(orderId)
    throw error
  }
}
