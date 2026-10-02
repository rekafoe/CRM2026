import type { PostalCarrierSettings } from './postalCarrierSettings'
import { carrierRequest, readJson, type CarrierRequest } from './postalCarrierHttp'
import {
  PostalCarrierError,
  carrierErrorText,
  directoryRows,
  findCarrierFile,
  findStringByKey,
  phoneDigits,
  pickGoodsId,
  pickSenderDeliveryId,
  pickWeightTypeId,
  sniffCarrierFile,
  splitRecipientName,
  type CarrierFile,
  type DirectoryRow,
} from './postalCarrierParse'
import type { CarrierDispatchResult } from './belpostGateway'

export type EuropostDispatchInput = {
  orderNumber: string
  externalRef: string
  recipientName: string
  recipientPhone: string
  recipientAddress: string
  weightKg: number
  notes: string
}

function endpoint(settings: PostalCarrierSettings): string {
  const raw = settings.europostApiUrl.trim().replace(/\/+$/, '')
  if (/\/json$/i.test(raw)) return raw
  const port = settings.europostApiPort.trim()
  return port ? `${raw}:${port}/Json` : `${raw}/Json`
}

function packet(settings: PostalCarrierSettings, method: string, data: unknown, jwt: string) {
  return {
    CRC: '',
    Packet: {
      JWT: jwt,
      MethodName: method,
      ServiceNumber: settings.europostServiceNumber.trim(),
      Data: data,
    },
  }
}

async function callMethod(
  settings: PostalCarrierSettings,
  method: string,
  data: unknown,
  jwt: string,
  request: CarrierRequest,
): Promise<unknown> {
  const response = await request({
    url: endpoint(settings),
    method: 'POST',
    body: packet(settings, method, data, jwt),
    timeoutMs: 40000,
  })
  const payload = readJson(response, 'Европочта')
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const error = carrierErrorText(record)
    if (record.Error || record.error) {
      throw new PostalCarrierError(`Европочта: ${error || 'отклонила запрос'}`, 502)
    }
  }
  return payload
}

function tableRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object' && Array.isArray((payload as { Table?: unknown }).Table)) {
    return (payload as { Table: unknown[] }).Table
  }
  return []
}

async function jwtToken(settings: PostalCarrierSettings, request: CarrierRequest): Promise<string> {
  const loginType = settings.europostLoginTypeId.trim()
  const payload = await callMethod(settings, 'GetJWT', {
    LoginName: settings.europostLogin.trim(),
    Password: settings.europostPassword,
    LoginNameTypeId: /^\d+$/.test(loginType) ? Number(loginType) : loginType,
  }, 'null', request)
  const token = findStringByKey(tableRows(payload)[0] ?? payload, 'JWT')
  if (!token || token === 'null') throw new PostalCarrierError('Европочта не выдала JWT. Проверьте логин, пароль и номер услуги.', 409)
  return token
}

async function directory(
  settings: PostalCarrierSettings,
  method: string,
  token: string,
  request: CarrierRequest,
): Promise<{ rows: DirectoryRow[]; raw: unknown[] }> {
  const payload = await callMethod(settings, method, {}, token, request)
  const raw = tableRows(payload)
  return { rows: directoryRows(raw.length ? raw : payload), raw }
}

async function resolveIds(
  settings: PostalCarrierSettings,
  grams: number,
  token: string,
  request: CarrierRequest,
): Promise<{ goodsId: string; deliveryId: string; weightId: string; warehouseId: string; note: string }> {
  const notes: string[] = []
  let goodsId = settings.europostGoodsId.trim()
  let deliveryId = settings.europostDeliveryTypeId.trim()
  let weightId = settings.europostWeightTypeId.trim()
  let warehouseId = settings.europostWarehouseId.trim()

  if (!goodsId || !deliveryId || !weightId || !warehouseId) {
    if (!goodsId) {
      const dir = await directory(settings, 'Postal.TypesDir', token, request)
      goodsId = pickGoodsId(dir.rows) || ''
      if (goodsId) notes.push(`товар ${goodsId}`)
    }
    if (!weightId) {
      const dir = await directory(settings, 'Postal.WeightTypeDir', token, request)
      weightId = pickWeightTypeId(dir.rows, grams, dir.raw) || ''
      if (weightId) notes.push(`вес ${weightId}`)
    }
    if (!deliveryId) {
      const dir = await directory(settings, 'Postal.DeliveryTypeDir', token, request)
      deliveryId = pickSenderDeliveryId(dir.rows) || ''
      if (deliveryId) notes.push(`доставка ${deliveryId}`)
    }
    if (!warehouseId) {
      const dir = await directory(settings, 'Postal.OfficesOut', token, request)
      if (dir.rows.length === 1) {
        warehouseId = dir.rows[0].id
        notes.push(`склад ${warehouseId}`)
      } else if (dir.rows.length > 1) {
        const list = dir.rows.slice(0, 8).map((row) => `${row.id}${row.label ? ` ${row.label}` : ''}`).join('; ')
        throw new PostalCarrierError(
          `Европочта вернула несколько складов отправки. Укажите склад в настройках: ${list}`,
          422,
        )
      }
    }
  }

  if (!goodsId || !deliveryId || !weightId || !warehouseId) {
    throw new PostalCarrierError(
      'Европочта не отдала справочник товара, веса, доставки или склада. Заполните эти номера в настройках.',
      422,
    )
  }
  return { goodsId, deliveryId, weightId, warehouseId, note: notes.length ? `Из справочника: ${notes.join(', ')}.` : '' }
}

function fileFromPayload(payload: unknown): CarrierFile | null {
  const bytes = findCarrierFile(payload)
  return bytes ? sniffCarrierFile(bytes) : null
}

export async function submitEuropost(
  input: EuropostDispatchInput,
  settings: PostalCarrierSettings,
  request: CarrierRequest = carrierRequest,
): Promise<CarrierDispatchResult> {
  const token = await jwtToken(settings, request)
  const grams = Math.max(1, Math.round(input.weightKg * 1000))
  const ids = await resolveIds(settings, grams, token, request)
  const person = splitRecipientName(input.recipientName)
  const phone = phoneDigits(input.recipientPhone)
  if (!phone) throw new PostalCarrierError('Для Европочты нужен телефон получателя', 400)

  const asId = (value: string) => (/^\d+$/.test(value) ? Number(value) : value)
  const created = await callMethod(settings, 'Postal.PutOrder', {
    GoodsId: asId(ids.goodsId),
    PostDeliveryTypeId: asId(ids.deliveryId),
    PostalWeightId: asId(ids.weightId),
    WarehouseIdStart: asId(ids.warehouseId),
    PhoneNumberReciever: phone,
    Name1Reciever: person.last,
    Name2Reciever: person.first,
    Name3Reciever: person.middle || undefined,
    PostalItemExternalId: input.externalRef,
    IsRecieverShipping: 0,
    IsRecieverCashOnDelivery: 0,
    CashOnDeliverySum: 0,
    InfoSender: input.notes || `Заказ ${input.orderNumber}`,
  }, token, request)

  const row = tableRows(created)[0] ?? created
  const tracking = findStringByKey(row, 'Number')
    || findStringByKey(row, 'SerialNumber')
    || findStringByKey(row, 'TrackNumber')
    || findStringByKey(created, 'Number')
  const theirId = findStringByKey(row, 'PostalItemId') || findStringByKey(row, 'PostalItemExternalId') || input.externalRef

  let file = fileFromPayload(created)
  let detail = ''
  if (!file && (tracking || theirId)) {
    try {
      const pdf = await callMethod(settings, 'Postal.GetPDFContent', {
        SerialNumber: tracking ? [{ SerialNumber: tracking }] : [],
        PostalItemExternalId: [{ PostalItemExternalId: input.externalRef }],
      }, token, request)
      file = fileFromPayload(pdf)
      if (!file) detail = 'Европочта приняла отправление, файл накладной ещё не пришёл.'
    } catch (error: any) {
      detail = error?.message || 'Накладная Европочты ещё не готова.'
    }
  }

  return {
    trackingNumber: tracking,
    externalId: theirId,
    documentId: input.externalRef,
    blankStatus: file ? 'ready' : 'processing',
    file,
    message: `Европочта приняла отправление, доставку оплачивает наше юрлицо. ${tracking ? `Номер ${tracking}.` : 'Номер Европочта пришлёт вместе с накладной.'} ${ids.note} ${detail}`.replace(/\s+/g, ' ').trim(),
  }
}

export async function probeEuropostAccess(
  settings: PostalCarrierSettings,
  request: CarrierRequest = carrierRequest,
): Promise<string> {
  await jwtToken(settings, request)
  return 'Европочта выдала доступ.'
}

export async function pullEuropostBlank(
  serialNumber: string | null,
  externalRef: string | null,
  settings: PostalCarrierSettings,
  request: CarrierRequest = carrierRequest,
): Promise<CarrierDispatchResult> {
  const token = await jwtToken(settings, request)
  const pdf = await callMethod(settings, 'Postal.GetPDFContent', {
    SerialNumber: serialNumber ? [{ SerialNumber: serialNumber }] : [],
    PostalItemExternalId: externalRef ? [{ PostalItemExternalId: externalRef }] : [],
  }, token, request)
  const file = fileFromPayload(pdf)
  return {
    trackingNumber: serialNumber,
    externalId: externalRef,
    documentId: externalRef,
    blankStatus: file ? 'ready' : 'processing',
    file,
    message: file ? 'Европочта отдала накладную.' : 'Европочта ещё не отдала файл накладной.',
  }
}
