import { submitBelpost } from '../services/belpostGateway'
import { submitEuropost } from '../services/europostGateway'
import { dispatchPostalShipment } from '../services/postalDispatch'
import { emptyPostalCarrierSettings } from '../services/postalCarrierSettings'
import {
  collectBelpostAddresses,
  collectEuropostOffices,
  decodePdfString,
  pickBelpostAddress,
  pickSenderDeliveryId,
  readS10,
} from '../services/postalCarrierParse'
import type { CarrierRequest } from '../services/postalCarrierHttp'

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF')

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(body)),
  }
}

describe('postal carrier responses', () => {
  it('берёт адрес Белпочты только если есть индекс, город и отделение', () => {
    const rows = collectBelpostAddresses({
      data: [
        { city: 'Минск' },
        { postcode: '220030', city: 'Минск', ops_id: '42', building: '1' },
      ],
    })
    expect(rows).toHaveLength(1)
    expect(pickBelpostAddress(rows, '220050 Минск')?.postcode).toBe('220030')
    expect(pickBelpostAddress(rows, 'индекс 220030')?.opsId).toBe('42')
  })

  it('не выдумывает трек и не ходит в API без JWT', async () => {
    const request: CarrierRequest = async () => {
      throw new Error('сеть не должна вызываться')
    }
    await expect(dispatchPostalShipment({
      carrier: 'belpost',
      orderNumber: 'ORD-1',
      externalRef: 'crm-1',
      recipientName: 'Иванов Иван',
      recipientPhone: '+375291112233',
      recipientAddress: '220030 Минск',
      pickupPointId: '',
      weightKg: 0.4,
      codAmount: null,
      declaredValue: null,
      notes: '',
    }, emptyPostalCarrierSettings(), request)).rejects.toThrow(/JWT Белпочты/)
    expect(readS10({ parcel: { weight: 1 } })).toBeNull()
  })

  it('сохраняет трек и PDF, которые вернула Белпочта', async () => {
    const request: CarrierRequest = async (input) => {
      if (input.url.includes('/autocomplete')) {
        return jsonResponse([{ postcode: '220030', city: 'Минск', ops_id: '7', building: '1' }])
      }
      if (input.url.endsWith('/batch-mailing/list')) {
        return jsonResponse({ id: 15 })
      }
      if (input.url.endsWith('/item')) {
        const body = input.body as { items: Array<{ addons: { recipient_payment: boolean; cash_on_delivery?: number } }> }
        expect(body.items[0].addons.recipient_payment).toBe(false)
        expect(body.items[0].addons.cash_on_delivery).toBe(12.5)
        return jsonResponse({ items: [{ s10code: 'CP123456789BY' }] })
      }
      if (input.url.endsWith('/generate-blank')) return jsonResponse({ documents: { id: 9, status: 'processing' } })
      if (input.url.includes('/documents/9/download')) {
        return { status: 200, contentType: 'application/pdf', body: pdf }
      }
      throw new Error(`неожиданный адрес ${input.url}`)
    }
    const result = await submitBelpost({
      orderNumber: 'ORD-2',
      recipientName: 'Иванов Иван',
      recipientPhone: '80291112233',
      recipientAddress: '220030, Минск, Ленина 1',
      weightKg: 0.4,
      codAmount: 12.5,
      declaredValue: 12.5,
    }, { ...emptyPostalCarrierSettings(), belpostJwt: 'token' }, request)
    expect(result.trackingNumber).toBe('CP123456789BY')
    expect(result.externalId).toBe('15')
    expect(result.blankStatus).toBe('ready')
    expect(result.file?.extension).toBe('pdf')
    expect(result.file?.bytes.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('кладёт накладную Европочты из их ответа и не берёт наложенный платёж', async () => {
    const encoded = pdf.toString('base64')
    const request: CarrierRequest = async (input) => {
      const body = input.body as { Packet: { MethodName: string; JWT: string; Data: Record<string, unknown> } }
      if (body.Packet.MethodName === 'GetJWT') return jsonResponse({ Table: [{ JWT: 'jwt-1' }] })
      if (body.Packet.MethodName === 'Postal.TypesDir') return jsonResponse({ Table: [{ GoodsId: 3, Name: 'Посылка' }] })
      if (body.Packet.MethodName === 'Postal.WeightTypeDir') {
        return jsonResponse({ Table: [{ WeightTypeId: 2, WeightMin: 0, WeightMax: 1000 }] })
      }
      if (body.Packet.MethodName === 'Postal.DeliveryTypeDir') {
        return jsonResponse({ Table: [{ DeliveryTypeId: 8, Name: 'Оплата отправителем' }] })
      }
      if (body.Packet.MethodName === 'Postal.OfficesOut') return jsonResponse({ Table: [{ WarehouseId: 4, WarehouseName: 'Минск' }] })
      if (body.Packet.MethodName === 'Postal.PutOrder') {
        expect(body.Packet.JWT).toBe('jwt-1')
        expect(body.Packet.Data.IsRecieverShipping).toBe(0)
        expect(body.Packet.Data.CashOnDeliverySum).toBe(0)
        expect(body.Packet.Data.WarehouseIdFinish).toBe(70130010)
        return jsonResponse({ Table: [{ Number: 'EP998877', PostalItemId: '555' }] })
      }
      if (body.Packet.MethodName === 'Postal.GetPDFContent') {
        return jsonResponse({ Table: [{ PDF: encoded }] })
      }
      throw new Error(body.Packet.MethodName)
    }
    const result = await submitEuropost({
      orderNumber: 'ORD-3',
      externalRef: 'crm-3-1',
      recipientName: 'Петров Пётр',
      recipientPhone: '+375291112233',
      recipientAddress: 'Отделение №1, Минск',
      pickupPointId: '70130010',
      weightKg: 0.5,
      notes: '',
    }, {
      ...emptyPostalCarrierSettings(),
      europostApiUrl: 'https://evro.example',
      europostServiceNumber: 'service',
      europostLogin: 'login',
      europostPassword: 'secret',
      europostLoginTypeId: '1',
    }, request)
    expect(result.trackingNumber).toBe('EP998877')
    expect(result.blankStatus).toBe('ready')
    expect(result.file?.bytes.subarray(0, 4).toString()).toBe('%PDF')
    expect(decodePdfString(encoded)?.subarray(0, 4).toString()).toBe('%PDF')
    expect(pickSenderDeliveryId([{ id: '1', label: 'За счёт получателя' }, { id: '8', label: 'Оплата отправителем' }])).toBe('8')
    expect(collectEuropostOffices({
      Table: [
        { WarehouseId: 70130010, WarehouseName: 'Отделение №1', Address7Name: 'Минск', Address: 'ул. Ленина, 1' },
        { WarehouseName: 'без номера' },
      ],
    })).toEqual([
      { id: '70130010', name: 'Отделение №1', city: 'Минск', address: 'ул. Ленина, 1' },
    ])
  })
})
