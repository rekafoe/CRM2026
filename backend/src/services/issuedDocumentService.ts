import crypto from 'crypto'
import { getDb } from '../config/database'
import { CustomerLegalDocumentService } from '../modules/customers/services/customerLegalDocumentService'

export type IssuedDocumentKind = 'receipt' | 'act' | 'invoice' | 'contract' | 'tn'

const NUMBER_PREFIX: Record<IssuedDocumentKind, string> = {
  receipt: 'ТЧ',
  act: 'А',
  invoice: 'С',
  contract: 'Д',
  tn: 'ТН',
}

const JOURNAL_TITLE: Record<IssuedDocumentKind, string> = {
  receipt: 'Товарный чек',
  act: 'Акт',
  invoice: 'Счёт',
  contract: 'Договор',
  tn: 'Товарная накладная',
}

export type StoredIssuedDocument = {
  id: number
  number: string
  filename: string
  mimeType: string
  buffer: Buffer
}

function orderKey(orderIds: number[]): string {
  return [...new Set(orderIds.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b).join(',')
}

export function documentSourceHash(payload: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex')
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

function asBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  throw new Error('Файл документа повреждён')
}

function formatIssuedDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('ru-RU')
}

export type CitedIssuedDocument = {
  number: string
  issuedDate: string
}

/**
 * Номер текущего документа остаётся в contractNumber: так уже подписаны шаблоны акта и счёта.
 * invoiceNumber и actNumber — номера своих документов. В договоре это ссылка на уже выданный
 * счёт или акт по тем же заказам, а не копия номера договора.
 * В накладной basis — счёт, а если счёта ещё нет, договор по тем же заказам.
 */
function documentBasis(
  invoice: CitedIssuedDocument | null | undefined,
  contract: CitedIssuedDocument | null | undefined,
): string {
  if (invoice?.number) {
    return invoice.issuedDate ? `Счёт ${invoice.number} от ${invoice.issuedDate}` : `Счёт ${invoice.number}`
  }
  if (contract?.number) {
    return contract.issuedDate ? `Договор ${contract.number} от ${contract.issuedDate}` : `Договор ${contract.number}`
  }
  return ''
}

export function numbersForIssuedDocument(args: {
  kind: IssuedDocumentKind
  number: string
  issuedDate: string
  invoice?: CitedIssuedDocument | null
  act?: CitedIssuedDocument | null
  citedContract?: CitedIssuedDocument | null
}): {
  contractNumber: string
  contractDate: string
  documentNumber: string
  documentDate: string
  invoiceNumber: string
  invoiceDate: string
  actNumber: string
  actDate: string
  basis: string
} {
  const invoice = args.kind === 'invoice'
    ? { number: args.number, issuedDate: args.issuedDate }
    : args.invoice
  const act = args.kind === 'act'
    ? { number: args.number, issuedDate: args.issuedDate }
    : args.act
  return {
    contractNumber: args.number,
    contractDate: args.issuedDate,
    documentNumber: args.number,
    documentDate: args.issuedDate,
    invoiceNumber: invoice?.number ?? '',
    invoiceDate: invoice?.issuedDate ?? '',
    actNumber: act?.number ?? '',
    actDate: act?.issuedDate ?? '',
    basis: args.kind === 'tn' ? documentBasis(invoice, args.citedContract) : '',
  }
}

export async function findLatestIssued(
  kind: IssuedDocumentKind,
  orderIds: number[],
): Promise<CitedIssuedDocument | null> {
  const key = orderKey(orderIds)
  if (!key) return null
  const db = await getDb()
  const row = await db.get<{ number: string; issued_at: string }>(
    `SELECT number, issued_at
     FROM issued_documents
     WHERE kind = ? AND order_key = ?
     ORDER BY issued_at DESC, id DESC
     LIMIT 1`,
    [kind, key],
  )
  if (!row?.number) return null
  return { number: row.number, issuedDate: formatIssuedDate(row.issued_at) }
}

async function readStored(kind: IssuedDocumentKind, key: string, sourceHash: string): Promise<StoredIssuedDocument | null> {
  const db = await getDb()
  const row = await db.get<{
    id: number
    number: string
    filename: string
    mime_type: string
    file_blob: unknown
  }>(
    `SELECT id, number, filename, mime_type, file_blob
     FROM issued_documents
     WHERE kind = ? AND order_key = ? AND source_hash = ?`,
    [kind, key, sourceHash],
  )
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    filename: row.filename,
    mimeType: row.mime_type,
    buffer: asBuffer(row.file_blob),
  }
}

async function allocateNumber(kind: IssuedDocumentKind): Promise<string> {
  const db = await getDb()
  await db.run(
    `INSERT INTO document_number_counters (kind, last_value) VALUES (?, 1)
     ON CONFLICT(kind) DO UPDATE SET last_value = last_value + 1`,
    [kind],
  )
  const row = await db.get<{ last_value: number }>(
    'SELECT last_value FROM document_number_counters WHERE kind = ?',
    [kind],
  )
  const value = Number(row?.last_value || 1)
  return `${NUMBER_PREFIX[kind]}-${String(value).padStart(5, '0')}`
}

async function ensureJournal(args: {
  issuedId: number
  kind: IssuedDocumentKind
  number: string
  customerId: number | null
  orderIds: number[]
  issuedAt: string
}): Promise<void> {
  if (!args.customerId) return
  const db = await getDb()
  const customer = await db.get<{ type?: string }>('SELECT type FROM customers WHERE id = ?', [args.customerId])
  if (customer?.type !== 'legal') return
  const existing = await db.get(
    'SELECT id FROM customer_legal_documents WHERE issued_document_id = ?',
    [args.issuedId],
  )
  if (existing) return
  const orderId = args.orderIds.length === 1 ? args.orderIds[0] : null
  const notes = args.orderIds.length > 1 ? `Заказы: ${args.orderIds.join(', ')}` : null
  await CustomerLegalDocumentService.create(args.customerId, {
    title: `${JOURNAL_TITLE[args.kind]} ${args.number}`,
    document_kind: args.kind,
    issued_at: args.issuedAt,
    returned_at: null,
    notes,
    order_id: orderId,
    issued_document_id: args.issuedId,
  })
}

/**
 * Первый выпуск сохраняет файл и занимает номер.
 * Повтор с тем же составом заказа отдаёт сохранённый файл, не пересобирая его.
 */
export async function issueOrReuse(args: {
  kind: IssuedDocumentKind
  orderIds: number[]
  customerId: number | null
  organizationId: number | null
  sourceHash: string
  totalAmount: number
  mimeType: string
  filenameFor: (number: string) => string
  render: (issued: { number: string; issuedAt: string; issuedDate: string }) => Promise<Buffer>
}): Promise<StoredIssuedDocument> {
  const key = orderKey(args.orderIds)
  const existing = await readStored(args.kind, key, args.sourceHash)
  if (existing) {
    const db = await getDb()
    const row = await db.get<{ issued_at: string }>(
      'SELECT issued_at FROM issued_documents WHERE id = ?',
      [existing.id],
    )
    await ensureJournal({
      issuedId: existing.id,
      kind: args.kind,
      number: existing.number,
      customerId: args.customerId,
      orderIds: args.orderIds,
      issuedAt: row?.issued_at || new Date().toISOString(),
    })
    return existing
  }

  const issuedAt = new Date().toISOString()
  const number = await allocateNumber(args.kind)
  const buffer = await args.render({
    number,
    issuedAt,
    issuedDate: formatIssuedDate(issuedAt),
  })
  const filename = args.filenameFor(number)
  const db = await getDb()
  try {
    const result = await db.run(
      `INSERT INTO issued_documents (
        kind, number, customer_id, organization_id, order_key, source_hash,
        total_amount, filename, mime_type, file_blob, issued_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        args.kind,
        number,
        args.customerId,
        args.organizationId,
        key,
        args.sourceHash,
        args.totalAmount,
        filename,
        args.mimeType,
        buffer,
        issuedAt,
      ],
    )
    const id = Number(result.lastID)
    await ensureJournal({
      issuedId: id,
      kind: args.kind,
      number,
      customerId: args.customerId,
      orderIds: args.orderIds,
      issuedAt,
    })
    return { id, number, filename, mimeType: args.mimeType, buffer }
  } catch (error: any) {
    const message = String(error?.message || '')
    if (!/UNIQUE/i.test(message)) throw error
    const raced = await readStored(args.kind, key, args.sourceHash)
    if (raced) return raced
    throw error
  }
}

export async function readIssuedFileForCustomer(
  customerId: number,
  legalDocumentId: number,
): Promise<StoredIssuedDocument> {
  const db = await getDb()
  const link = await db.get<{ issued_document_id: number | null }>(
    'SELECT issued_document_id FROM customer_legal_documents WHERE id = ? AND customer_id = ?',
    [legalDocumentId, customerId],
  )
  if (!link?.issued_document_id) throw new Error('Файл документа не сохранён')
  const row = await db.get<{
    id: number
    number: string
    filename: string
    mime_type: string
    file_blob: unknown
  }>(
    'SELECT id, number, filename, mime_type, file_blob FROM issued_documents WHERE id = ?',
    [link.issued_document_id],
  )
  if (!row) throw new Error('Файл документа не найден')
  return {
    id: row.id,
    number: row.number,
    filename: row.filename,
    mimeType: row.mime_type,
    buffer: asBuffer(row.file_blob),
  }
}
