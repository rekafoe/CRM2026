import type { PostalCarrierSettings } from './postalCarrierSettings'
import { carrierRequest, readJson, type CarrierRequest } from './postalCarrierHttp'
import {
  PostalCarrierError,
  asJson,
  collectBelpostAddresses,
  parseBelpostTracking,
  type TrackingEvent,
  findStringByKey,
  phoneDigits,
  pickBelpostAddress,
  readBelpostId,
  readS10,
  recipientLooksLegal,
  sniffCarrierFile,
  splitRecipientName,
  type CarrierFile,
} from './postalCarrierParse'

export type BelpostDispatchInput = {
  orderNumber: string
  recipientName: string
  recipientPhone: string
  recipientAddress: string
  weightKg: number
  codAmount: number | null
  declaredValue: number | null
}

export type CarrierDispatchResult = {
  trackingNumber: string | null
  externalId: string | null
  documentId: string | null
  blankStatus: 'none' | 'processing' | 'ready'
  file: CarrierFile | null
  message: string
}

function baseUrl(settings: PostalCarrierSettings): string {
  return (settings.belpostBaseUrl || 'https://api.belpost.by').replace(/\/+$/, '')
}

function authHeaders(settings: PostalCarrierSettings): Record<string, string> {
  return { Authorization: `Bearer ${settings.belpostJwt.trim()}` }
}

async function downloadDocument(
  settings: PostalCarrierSettings,
  documentId: string,
  request: CarrierRequest,
): Promise<{ file: CarrierFile | null; processing: boolean; detail: string }> {
  const response = await request({
    url: `${baseUrl(settings)}/api/v1/batch-mailing/documents/${encodeURIComponent(documentId)}/download`,
    method: 'GET',
    headers: { ...authHeaders(settings), Accept: '*/*' },
    timeoutMs: 40000,
  })
  const sniffed = sniffCarrierFile(response.body)
  if (response.status >= 200 && response.status < 300 && sniffed) {
    return { file: sniffed, processing: false, detail: '' }
  }
  const parsed = asJson(response.body)
  const status = findStringByKey(parsed, 'status')
  if (response.status === 404 || status === 'processing' || response.status === 202) {
    return { file: null, processing: true, detail: 'Белпочта ещё формирует бланк.' }
  }
  if (response.status >= 200 && response.status < 300) {
    return { file: null, processing: true, detail: 'Белпочта приняла запрос бланка, файл ещё не готов.' }
  }
  const text = response.body.toString('utf8').replace(/\s+/g, ' ').trim().slice(0, 300)
  return { file: null, processing: true, detail: text || 'Бланк Белпочты пока не скачался.' }
}

export async function submitBelpost(
  input: BelpostDispatchInput,
  settings: PostalCarrierSettings,
  request: CarrierRequest = carrierRequest,
): Promise<CarrierDispatchResult> {
  const headers = authHeaders(settings)
  const search = await request({
    url: `${baseUrl(settings)}/api/v1/postcodes/autocomplete?search=${encodeURIComponent(input.recipientAddress)}`,
    method: 'GET',
    headers,
  })
  const addresses = collectBelpostAddresses(readJson(search, 'Белпочта'))
  const address = pickBelpostAddress(addresses, input.recipientAddress)
  if (!address) {
    throw new PostalCarrierError(
      'Белпочта не нашла отделение по этому адресу. Добавьте индекс из шести цифр и город.',
      422,
    )
  }

  const declared = input.declaredValue
  const batchPayload = {
    postal_delivery_type: declared != null ? 'package_declare_value' : 'package',
    direction: 'internal',
    payment_type: 'payment_order',
    negotiated_rate: false,
    is_declared_value: declared != null,
    is_partial_receipt: false,
    postal_items_in_ops: false,
    name: `Заказ ${input.orderNumber}`.slice(0, 120),
  }
  const batch = readJson(await request({
    url: `${baseUrl(settings)}/api/v1/business/batch-mailing/list`,
    method: 'POST',
    headers,
    body: batchPayload,
  }), 'Белпочта')
  const batchId = readBelpostId(batch)
  if (!batchId) throw new PostalCarrierError('Белпочта не вернула номер партии', 502)

  const person = splitRecipientName(input.recipientName)
  const legal = recipientLooksLegal(input.recipientName)
  const grams = Math.max(1, Math.round(input.weightKg * 1000))
  const addons: Record<string, unknown> = { recipient_payment: false }
  if (declared != null) addons.declared_value = declared
  if (input.codAmount != null) addons.cash_on_delivery = input.codAmount
  const itemBody = {
    items: [
      {
        recipient_object: {
          type: legal ? 'legal' : 'individual',
          ...(legal
            ? { company_name: input.recipientName }
            : { last_name: person.last, first_name: person.first, second_name: person.middle || undefined }),
          phone: phoneDigits(input.recipientPhone) || undefined,
          address: {
            address_type: 'address',
            postcode: address.postcode,
            country_code: 'BY',
            city: address.city,
            region: address.region || undefined,
            district: address.district || undefined,
            building: address.building || undefined,
            ops_id: address.opsId,
          },
        },
        notification: 0,
        category: declared != null || input.codAmount != null ? 2 : 0,
        weight: grams,
        addons,
      },
    ],
  }

  let item: unknown
  try {
    item = readJson(await request({
      url: `${baseUrl(settings)}/api/v1/business/batch-mailing/list/${encodeURIComponent(batchId)}/item`,
      method: 'POST',
      headers,
      body: itemBody,
    }), 'Белпочта')
  } catch (error: any) {
    const message = error?.message || 'Белпочта не приняла отправление'
    throw new PostalCarrierError(`${message} Партия ${batchId} уже создана в кабинете Белпочты.`, error?.status || 502)
  }

  const tracking = readS10(item) || readS10(batch)
  let documentId: string | null = null
  let file: CarrierFile | null = null
  let blankStatus: CarrierDispatchResult['blankStatus'] = 'none'
  let detail = ''
  try {
    const generated = readJson(await request({
      url: `${baseUrl(settings)}/api/v1/business/batch-mailing/list/${encodeURIComponent(batchId)}/generate-blank`,
      method: 'POST',
      headers,
      body: {},
    }), 'Белпочта')
    const documents = generated && typeof generated === 'object'
      ? (generated as { documents?: unknown }).documents
      : null
    documentId = documents && typeof documents === 'object'
      ? readBelpostId({ documents })
      : readBelpostId(generated)
    const generatedStatus = findStringByKey(documents, 'status')
    if (documentId) {
      const downloaded = await downloadDocument(settings, documentId, request)
      file = downloaded.file
      blankStatus = file ? 'ready' : 'processing'
      detail = downloaded.detail
      if (!file && generatedStatus && generatedStatus !== 'processing') detail = detail || `Статус бланка: ${generatedStatus}`
    } else {
      blankStatus = 'processing'
      detail = 'Белпочта приняла партию, номер бланка ещё не пришёл.'
    }
  } catch (error: any) {
    blankStatus = 'processing'
    detail = error?.message || 'Бланк Белпочты ещё не готов.'
  }

  const trackNote = tracking ? `Трек ${tracking}.` : 'Трек Белпочта пришлёт на бланке, CRM его не придумывает.'
  const codNote = input.codAmount != null ? ` Наложенный платёж ${input.codAmount.toFixed(2)} BYN.` : ''
  return {
    trackingNumber: tracking,
    externalId: batchId,
    documentId,
    blankStatus: file ? 'ready' : blankStatus,
    file,
    message: `Белпочта приняла отправление, почтовый сбор по договору нашего юрлица. ${trackNote}${codNote} ${detail}`.replace(/\s+/g, ' ').trim(),
  }
}

export async function fetchBelpostTracking(
  trackingNumber: string,
  settings: PostalCarrierSettings,
  request: CarrierRequest = carrierRequest,
): Promise<TrackingEvent[]> {
  const response = await request({
    url: `${baseUrl(settings)}/api/v1/tracking`,
    method: 'POST',
    headers: settings.belpostJwt.trim() ? authHeaders(settings) : {},
    body: { number: trackingNumber.trim() },
  })
  if (response.status === 429) {
    throw new PostalCarrierError('Белпочта ограничила частоту запросов отслеживания. Повторите чуть позже.', 429)
  }
  return parseBelpostTracking(readJson(response, 'Белпочта'))
}

export async function probeBelpostAccess(
  settings: PostalCarrierSettings,
  request: CarrierRequest = carrierRequest,
): Promise<string> {
  readJson(await request({
    url: `${baseUrl(settings)}/api/v1/business/postal-deliveries/countries`,
    method: 'GET',
    headers: authHeaders(settings),
  }), 'Белпочта')
  return 'Белпочта приняла JWT.'
}

export async function pullBelpostBlank(
  documentId: string,
  settings: PostalCarrierSettings,
  request: CarrierRequest = carrierRequest,
): Promise<CarrierDispatchResult> {
  const downloaded = await downloadDocument(settings, documentId, request)
  return {
    trackingNumber: null,
    externalId: null,
    documentId,
    blankStatus: downloaded.file ? 'ready' : 'processing',
    file: downloaded.file,
    message: downloaded.file ? 'Белпочта отдала бланк.' : (downloaded.detail || 'Бланк Белпочты ещё формируется.'),
  }
}
