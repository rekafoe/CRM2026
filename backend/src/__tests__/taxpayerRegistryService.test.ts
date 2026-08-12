import {
  TaxpayerRegistryService,
  parseTaxpayerRegistryPayload,
} from '../services/taxpayerRegistryService'

function response(status: number, payload?: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response
}

describe('TaxpayerRegistryService', () => {
  it('normalizes an active legal entity', () => {
    expect(
      parseTaxpayerRegistryPayload({
        ROW: {
          VUNP: '100582333',
          VNAIMP: ' Министерство по налогам и сборам Республики Беларусь ',
          VNAIMK: 'МНС',
          VPADRES: 'г.Минск,ул.Советская,9',
          DREG: '30.06.1994',
          NMNS: '104',
          VMNS: 'Инспекция МНС ',
          CKODSOST: '1',
          VKODS: ' Действующий ',
        },
      }),
    ).toEqual({
      unp: '100582333',
      fullName: 'Министерство по налогам и сборам Республики Беларусь',
      shortName: 'МНС',
      address: 'г.Минск,ул.Советская,9',
      registrationDate: '30.06.1994',
      taxOfficeCode: '104',
      taxOfficeName: 'Инспекция МНС',
      statusCode: '1',
      statusLabel: 'Действующий',
      isActive: true,
    })
  })

  it('normalizes an individual entrepreneur with null address', () => {
    const parsed = parseTaxpayerRegistryPayload({
      ROW: {
        VUNP: '190000001',
        VNAIMP: 'Индивидуальный предприниматель Иванов Иван Иванович',
        VNAIMK: null,
        VPADRES: null,
        DREG: '01.02.2020',
        NMNS: '101',
        VMNS: 'Инспекция МНС',
        CKODSOST: '1',
        VKODS: 'действующий',
      },
    })

    expect(parsed?.shortName).toBeNull()
    expect(parsed?.address).toBeNull()
    expect(parsed?.isActive).toBe(true)
  })

  it('marks any other status as inactive', () => {
    const parsed = parseTaxpayerRegistryPayload({
      ROW: {
        VUNP: '190000002',
        VNAIMP: 'ООО Тест',
        VKODS: 'Ликвидирован',
      },
    })
    expect(parsed?.isActive).toBe(false)
  })

  it('maps upstream 404 to NOT_FOUND', async () => {
    const service = new TaxpayerRegistryService({
      fetchImpl: jest.fn().mockResolvedValue(response(404)) as unknown as typeof fetch,
    })

    await expect(service.lookup('999999999')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
  })

  it('maps upstream failures to a safe error', async () => {
    const service = new TaxpayerRegistryService({
      fetchImpl: jest.fn().mockResolvedValue(response(500)) as unknown as typeof fetch,
    })

    await expect(service.lookup('100582333')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      status: 502,
      message: 'Сервис ГРП МНС временно недоступен',
    })
  })
})
