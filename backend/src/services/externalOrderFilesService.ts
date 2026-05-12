import path from 'path'
import { getDb } from '../config/database'

type ExternalOrderFileInput = {
  orderItemId?: number | string | null
  storage?: string | null
  provider?: string | null
  bucket?: string | null
  key?: string | null
  url?: string | null
  filename?: string | null
  originalName?: string | null
  mime?: string | null
  size?: number | string | null
  status?: string | null
  artifactType?: string | null
  checksum?: string | null
  partNumber?: number | string | null
  metadata?: unknown
}

type RegisterExternalFilesInput = {
  orderId: number
  files: ExternalOrderFileInput[]
  requireWebsiteSource?: boolean
}

type UpdateExternalFileInput = {
  orderId: number
  fileId: number
  data: ExternalOrderFileInput
  requireWebsiteSource?: boolean
}

function nullableText(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text : null
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function filenameFromInput(file: ExternalOrderFileInput): string {
  const explicit = nullableText(file.filename ?? file.originalName)
  if (explicit) return path.basename(explicit)

  const key = nullableText(file.key)
  if (key) {
    const fromKey = path.posix.basename(key.replace(/\\/g, '/'))
    if (fromKey && fromKey !== '.' && fromKey !== '/') return fromKey
  }

  return `external-file-${Date.now()}`
}

function metadataToString(metadata: unknown): string | null {
  if (metadata == null) return null
  if (typeof metadata === 'string') return nullableText(metadata)
  try {
    return JSON.stringify(metadata)
  } catch {
    return null
  }
}

async function resolveOrderItemId(db: any, orderId: number, raw: unknown): Promise<number | null> {
  const orderItemId = nullableNumber(raw)
  if (orderItemId == null) return null

  const item = await db.get('SELECT orderId FROM items WHERE id = ?', orderItemId) as { orderId: number } | undefined
  if (!item || Number(item.orderId) !== orderId) {
    throw Object.assign(new Error('orderItemId не принадлежит заказу'), { status: 400 })
  }

  return orderItemId
}

async function assertOrderAccess(db: any, orderId: number, requireWebsiteSource?: boolean): Promise<void> {
  const order = await db.get('SELECT id, source FROM orders WHERE id = ?', orderId) as { id: number; source?: string } | undefined
  if (!order) throw Object.assign(new Error('Заказ не найден'), { status: 404 })
  if (requireWebsiteSource && order.source !== 'website') {
    throw Object.assign(new Error('Регистрация внешних файлов по API-ключу разрешена только для заказов с сайта'), { status: 403 })
  }
}

function selectOrderFilesByIdsSql(placeholders: string): string {
  return `SELECT id, orderId, orderItemId, filename, originalName, mime, size, uploadedAt, approved, approvedAt, approvedBy,
    storage, externalProvider, externalBucket, externalKey, externalUrl, externalStatus, artifactType, checksum, partNumber, metadata
   FROM order_files WHERE id IN (${placeholders}) ORDER BY id ASC`
}

async function findExistingExternalFile(db: any, orderId: number, externalKey: string | null, externalUrl: string | null): Promise<{ id: number } | undefined> {
  if (externalKey) {
    return db.get('SELECT id FROM order_files WHERE orderId = ? AND externalKey = ? ORDER BY id DESC LIMIT 1', orderId, externalKey) as Promise<{ id: number } | undefined>
  }
  if (externalUrl) {
    return db.get('SELECT id FROM order_files WHERE orderId = ? AND externalUrl = ? ORDER BY id DESC LIMIT 1', orderId, externalUrl) as Promise<{ id: number } | undefined>
  }
  return undefined
}

export async function registerExternalOrderFiles(input: RegisterExternalFilesInput): Promise<any[]> {
  const db = await getDb()
  await assertOrderAccess(db, input.orderId, input.requireWebsiteSource)

  const insertedIds: number[] = []
  for (const file of input.files) {
    const externalKey = nullableText(file.key)
    const externalUrl = nullableText(file.url)
    if (!externalKey && !externalUrl) {
      throw Object.assign(new Error('Для внешнего файла нужен key или url'), { status: 400 })
    }

    const orderItemId = await resolveOrderItemId(db, input.orderId, file.orderItemId)
    const filename = filenameFromInput(file)
    const originalName = nullableText(file.originalName ?? file.filename) ?? filename
    const existing = await findExistingExternalFile(db, input.orderId, externalKey, externalUrl)
    if (existing?.id != null) {
      await db.run(
        `UPDATE order_files SET
          orderItemId = ?, filename = ?, originalName = ?, mime = ?, size = ?,
          storage = ?, externalProvider = ?, externalBucket = ?, externalKey = ?, externalUrl = ?, externalStatus = ?,
          artifactType = ?, checksum = ?, partNumber = ?, metadata = ?
        WHERE id = ? AND orderId = ?`,
        orderItemId,
        filename,
        originalName,
        nullableText(file.mime),
        nullableNumber(file.size),
        nullableText(file.storage) ?? 's3',
        nullableText(file.provider) ?? 's3',
        nullableText(file.bucket),
        externalKey,
        externalUrl,
        nullableText(file.status) ?? 'ready',
        nullableText(file.artifactType),
        nullableText(file.checksum),
        nullableNumber(file.partNumber),
        metadataToString(file.metadata),
        existing.id,
        input.orderId
      )
      insertedIds.push(Number(existing.id))
      continue
    }

    const result = await db.run(
      `INSERT INTO order_files (
        orderId, orderItemId, filename, originalName, mime, size,
        storage, externalProvider, externalBucket, externalKey, externalUrl, externalStatus,
        artifactType, checksum, partNumber, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.orderId,
      orderItemId,
      filename,
      originalName,
      nullableText(file.mime),
      nullableNumber(file.size),
      nullableText(file.storage) ?? 's3',
      nullableText(file.provider) ?? 's3',
      nullableText(file.bucket),
      externalKey,
      externalUrl,
      nullableText(file.status) ?? 'ready',
      nullableText(file.artifactType),
      nullableText(file.checksum),
      nullableNumber(file.partNumber),
      metadataToString(file.metadata)
    )
    if (result.lastID != null) insertedIds.push(Number(result.lastID))
  }

  if (insertedIds.length === 0) return []
  const placeholders = insertedIds.map(() => '?').join(',')
  return db.all(selectOrderFilesByIdsSql(placeholders), ...insertedIds)
}

export async function updateExternalOrderFile(input: UpdateExternalFileInput): Promise<any> {
  const db = await getDb()
  await assertOrderAccess(db, input.orderId, input.requireWebsiteSource)

  const current = await db.get(
    'SELECT id, storage FROM order_files WHERE id = ? AND orderId = ?',
    input.fileId,
    input.orderId
  ) as { id: number; storage?: string | null } | undefined
  if (!current) throw Object.assign(new Error('Файл не найден'), { status: 404 })
  if (!current.storage || current.storage === 'local') {
    throw Object.assign(new Error('Обновлять через этот endpoint можно только внешние файлы'), { status: 400 })
  }

  const file = input.data
  const externalKey = nullableText(file.key)
  const externalUrl = nullableText(file.url)
  const orderItemId = await resolveOrderItemId(db, input.orderId, file.orderItemId)
  const filename = filenameFromInput(file)
  const originalName = nullableText(file.originalName ?? file.filename) ?? filename

  await db.run(
    `UPDATE order_files SET
      orderItemId = COALESCE(?, orderItemId),
      filename = COALESCE(?, filename),
      originalName = COALESCE(?, originalName),
      mime = COALESCE(?, mime),
      size = COALESCE(?, size),
      storage = COALESCE(?, storage),
      externalProvider = COALESCE(?, externalProvider),
      externalBucket = COALESCE(?, externalBucket),
      externalKey = COALESCE(?, externalKey),
      externalUrl = COALESCE(?, externalUrl),
      externalStatus = COALESCE(?, externalStatus),
      artifactType = COALESCE(?, artifactType),
      checksum = COALESCE(?, checksum),
      partNumber = COALESCE(?, partNumber),
      metadata = COALESCE(?, metadata)
    WHERE id = ? AND orderId = ?`,
    orderItemId,
    nullableText(file.filename ?? file.originalName) ? filename : null,
    nullableText(file.originalName ?? file.filename) ? originalName : null,
    nullableText(file.mime),
    nullableNumber(file.size),
    nullableText(file.storage),
    nullableText(file.provider),
    nullableText(file.bucket),
    externalKey,
    externalUrl,
    nullableText(file.status),
    nullableText(file.artifactType),
    nullableText(file.checksum),
    nullableNumber(file.partNumber),
    metadataToString(file.metadata),
    input.fileId,
    input.orderId
  )

  const rows = await db.all(selectOrderFilesByIdsSql('?'), input.fileId)
  return rows[0] ?? null
}
