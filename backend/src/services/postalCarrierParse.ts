export class PostalCarrierError extends Error {
  status: number

  constructor(message: string, status = 502) {
    super(message)
    this.status = status
  }
}

export type BelpostResolvedAddress = {
  postcode: string
  city: string
  region: string
  district: string
  building: string
  opsId: string
}

export type CarrierFile = {
  bytes: Buffer
  contentType: string
  extension: 'pdf' | 'zip'
}

export function splitRecipientName(full: string): { last: string; first: string; middle: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { last: 'Получатель', first: 'Получатель', middle: '' }
  if (parts.length === 1) return { last: parts[0], first: parts[0], middle: '' }
  if (parts.length === 2) return { last: parts[0], first: parts[1], middle: '' }
  return { last: parts[0], first: parts[1], middle: parts.slice(2).join(' ') }
}

export function recipientLooksLegal(name: string): boolean {
  return /^(ООО|ОАО|ЗАО|ЧУП|ИП|УП|РУП)\b/i.test(name.trim())
}

export function phoneDigits(value: string): string {
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('80') && digits.length === 11) digits = `375${digits.slice(2)}`
  return digits
}

export function asJson(body: Buffer): unknown | null {
  const text = body.toString('utf8').trim()
  if (!text.startsWith('{') && !text.startsWith('[')) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export function carrierErrorText(payload: unknown): string {
  if (typeof payload === 'string') return payload.trim().slice(0, 500)
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>
  for (const key of ['message', 'Message', 'error', 'Error', 'ErrorDescription', 'error_description']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500)
  }
  if (record.errors) return JSON.stringify(record.errors).slice(0, 500)
  return ''
}

export function sniffCarrierFile(bytes: Buffer): CarrierFile | null {
  if (bytes.length >= 4 && bytes.subarray(0, 5).toString('utf8').startsWith('%PDF')) {
    return { bytes, contentType: 'application/pdf', extension: 'pdf' }
  }
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return { bytes, contentType: 'application/zip', extension: 'zip' }
  }
  return null
}

export function decodePdfString(value: string): Buffer | null {
  const trimmed = value.trim()
  if (trimmed.startsWith('%PDF')) return Buffer.from(trimmed, 'utf8')
  const compact = trimmed.replace(/\s/g, '')
  if (!compact.startsWith('JVBERi0') || compact.length < 32) return null
  try {
    const decoded = Buffer.from(compact, 'base64')
    return sniffCarrierFile(decoded)?.bytes ?? null
  } catch {
    return null
  }
}

export function findCarrierFile(payload: unknown, depth = 0): Buffer | null {
  if (depth > 6 || payload == null) return null
  if (typeof payload === 'string') return decodePdfString(payload)
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findCarrierFile(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof payload !== 'object') return null
  for (const value of Object.values(payload as Record<string, unknown>)) {
    const found = findCarrierFile(value, depth + 1)
    if (found) return found
  }
  return null
}

export function findStringByKey(payload: unknown, key: string, depth = 0): string | null {
  if (depth > 8 || payload == null) return null
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findStringByKey(item, key, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  for (const [name, value] of Object.entries(record)) {
    if (name.toLowerCase() !== key.toLowerCase()) continue
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  for (const value of Object.values(record)) {
    const found = findStringByKey(value, key, depth + 1)
    if (found) return found
  }
  return null
}

function textField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function flattenAddress(record: Record<string, unknown>): Record<string, unknown> {
  const nested = record.address
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return { ...record, ...(nested as Record<string, unknown>) }
  }
  return record
}

export function collectBelpostAddresses(payload: unknown): BelpostResolvedAddress[] {
  const rows: unknown[] = []
  if (Array.isArray(payload)) rows.push(...payload)
  else if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    for (const key of ['data', 'addresses', 'items', 'results']) {
      if (Array.isArray(record[key])) rows.push(...(record[key] as unknown[]))
    }
  }
  const found: BelpostResolvedAddress[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const flat = flattenAddress(row as Record<string, unknown>)
    const postcode = textField(flat, ['postcode', 'post_code', 'postal_code', 'index'])
    const city = textField(flat, ['city', 'locality', 'locality_name', 'city_name'])
    const opsId = textField(flat, ['ops_id', 'opsId', 'ops'])
    if (!/^\d{6}$/.test(postcode) || !city || !opsId) continue
    found.push({
      postcode,
      city,
      region: textField(flat, ['region']),
      district: textField(flat, ['district']),
      building: textField(flat, ['building', 'house']),
      opsId,
    })
  }
  return found
}

export function pickBelpostAddress(addresses: BelpostResolvedAddress[], query: string): BelpostResolvedAddress | null {
  if (addresses.length === 0) return null
  const index = query.match(/\b(\d{6})\b/)?.[1]
  if (index) {
    const matched = addresses.find((row) => row.postcode === index)
    if (matched) return matched
  }
  return addresses[0]
}

export function readBelpostId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const nested = [record, record.data, record.list, record.batch].filter((item) => item && typeof item === 'object') as Record<string, unknown>[]
  for (const item of nested) {
    const id = item.id ?? item.list_id
    if (typeof id === 'number' && id > 0) return String(id)
    if (typeof id === 'string' && /^\d+$/.test(id)) return id
  }
  const documents = record.documents
  if (documents && typeof documents === 'object') {
    const id = (documents as Record<string, unknown>).id
    if (typeof id === 'number' && id > 0) return String(id)
    if (typeof id === 'string' && /^\d+$/.test(id)) return id
  }
  return null
}

export function readS10(payload: unknown): string | null {
  const code = findStringByKey(payload, 's10code')
  if (!code || code.length < 8) return null
  return code
}

export type DirectoryRow = { id: string; label: string }

export function directoryRows(payload: unknown): DirectoryRow[] {
  const table = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { Table?: unknown }).Table)
      ? ((payload as { Table: unknown[] }).Table)
      : []
  const rows: DirectoryRow[] = []
  for (const item of table) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = textField(record, [
      'GoodsId', 'WarehouseId', 'WeightTypeId', 'PostalWeightId', 'DeliveryTypeId',
      'PostDeliveryTypeId', 'Id', 'id', 'TypeId',
    ])
    if (!id) continue
    const label = textField(record, ['Name', 'NameRu', 'Description', 'GoodsName', 'WarehouseName', 'Title', 'TypeName'])
    rows.push({ id, label })
  }
  return rows
}

export function pickWeightTypeId(rows: DirectoryRow[], grams: number, rawRows: unknown[]): string | null {
  const source = Array.isArray(rawRows) ? rawRows : []
  for (const item of source) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = textField(record, ['WeightTypeId', 'PostalWeightId', 'Id', 'id'])
    const min = Number(record.WeightMin ?? record.MinWeight ?? record.FromWeight)
    const max = Number(record.WeightMax ?? record.MaxWeight ?? record.ToWeight)
    if (!id || !Number.isFinite(min) || !Number.isFinite(max)) continue
    const asGrams = max > 200
    const minG = asGrams ? min : min * 1000
    const maxG = asGrams ? max : max * 1000
    if (grams >= minG && grams <= maxG) return id
  }
  return rows[0]?.id ?? null
}

export function pickSenderDeliveryId(rows: DirectoryRow[]): string | null {
  const sender = rows.find((row) => /отправит|договор/i.test(row.label))
  if (sender) return sender.id
  const notReceiver = rows.find((row) => row.label && !/получател/i.test(row.label))
  return notReceiver?.id ?? rows[0]?.id ?? null
}

export type EuropostOffice = {
  id: string
  name: string
  address: string
  city: string
}

export function collectEuropostOffices(payload: unknown): EuropostOffice[] {
  const table = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { Table?: unknown }).Table)
      ? (payload as { Table: unknown[] }).Table
      : []
  const offices: EuropostOffice[] = []
  const seen = new Set<string>()
  for (const item of table) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = textField(record, ['WarehouseId', 'Id', 'id'])
    const name = textField(record, ['WarehouseName', 'Name', 'NameRu'])
    const address = textField(record, ['Address', 'AddressName', 'WarehouseAddress', 'Info1', 'Note'])
    const city = textField(record, ['Address7Name', 'City', 'CityName', 'Locality'])
    if (!id || seen.has(id) || (!name && !address)) continue
    seen.add(id)
    offices.push({ id, name: name || address, address, city })
  }
  return offices
}

export function pickGoodsId(rows: DirectoryRow[]): string | null {
  const preferred = rows.find((row) => /посыл|товар|отправ/i.test(row.label))
  return preferred?.id ?? rows[0]?.id ?? null
}
