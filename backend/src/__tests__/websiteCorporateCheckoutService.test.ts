import {
  validateWebsiteCorporateCheckout,
} from '../services/websiteCorporateCheckoutService'
import { TaxpayerRegistryDto } from '../services/taxpayerRegistryService'

const legalCustomer = {
  company_name: 'МНС',
  legal_name: 'Министерство по налогам и сборам Республики Беларусь',
  tax_id: '100582333',
  address: 'Адрес для документов',
  bank_details:
    'IBAN: BY86AKBB36429000000000000000\nБанк: ОАО АСБ Беларусбанк\nБИК: AKBBBY2X\nАдрес банка: г. Минск',
  authorized_person: 'Иванов Иван Иванович, действует на основании: Устава',
  phone: '+375291234567',
  email: 'accounting@example.by',
  authority_confirmed: true as const,
}

const taxpayer: TaxpayerRegistryDto = {
  unp: '100582333',
  fullName: 'Министерство по налогам и сборам Республики Беларусь',
  shortName: 'МНС',
  address: 'Официальный адрес',
  registrationDate: '30.06.1994',
  taxOfficeCode: '104',
  taxOfficeName: 'Инспекция МНС',
  statusCode: '1',
  statusLabel: 'Действующий',
  isActive: true,
}

describe('validateWebsiteCorporateCheckout', () => {
  it('accepts official names and keeps a manually entered address', async () => {
    const result = await validateWebsiteCorporateCheckout(legalCustomer, async () => taxpayer)

    expect(result.legalCustomer.address).toBe('Адрес для документов')
    expect(result.taxpayer.isActive).toBe(true)
  })

  it('rejects missing required requisites', async () => {
    await expect(
      validateWebsiteCorporateCheckout(
        { ...legalCustomer, bank_details: '' },
        async () => taxpayer,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Поле legalCustomer.bank_details обязательно',
    })
  })

  it('rejects incomplete bank details and a missing authority confirmation', async () => {
    await expect(
      validateWebsiteCorporateCheckout(
        { ...legalCustomer, bank_details: 'IBAN: BY86AKBB36429000000000000000' },
        async () => taxpayer,
      ),
    ).rejects.toMatchObject({ status: 400 })

    await expect(
      validateWebsiteCorporateCheckout(
        { ...legalCustomer, authority_confirmed: false },
        async () => taxpayer,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Не подтверждено право действовать от имени плательщика',
    })
  })

  it('rejects inactive taxpayers', async () => {
    await expect(
      validateWebsiteCorporateCheckout(legalCustomer, async () => ({
        ...taxpayer,
        isActive: false,
        statusLabel: 'Ликвидирован',
      })),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('rejects names that differ from the official registry', async () => {
    await expect(
      validateWebsiteCorporateCheckout(
        { ...legalCustomer, legal_name: 'ООО Подмена' },
        async () => taxpayer,
      ),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('uses fullName as company_name when an IP has no short name', async () => {
    const ipName = 'Индивидуальный предприниматель Иванов Иван Иванович'
    const result = await validateWebsiteCorporateCheckout(
      {
        ...legalCustomer,
        company_name: ipName,
        legal_name: ipName,
        tax_id: '190000001',
      },
      async () => ({
        ...taxpayer,
        unp: '190000001',
        fullName: ipName,
        shortName: null,
        address: null,
      }),
    )

    expect(result.legalCustomer.company_name).toBe(ipName)
  })
})
