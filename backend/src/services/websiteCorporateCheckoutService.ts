import {
  TaxpayerRegistryDto,
  TaxpayerRegistryError,
  taxpayerRegistryService,
} from './taxpayerRegistryService'

export interface WebsiteLegalCustomerInput {
  company_name: string
  legal_name: string
  tax_id: string
  address: string
  bank_details: string
  authorized_person: string
  phone: string
  email: string
  authority_confirmed: true
}

export class WebsiteCorporateCheckoutError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'WebsiteCorporateCheckoutError'
  }
}

type WebsiteLegalCustomerTextField = Exclude<keyof WebsiteLegalCustomerInput, 'authority_confirmed'>

const REQUIRED_LEGAL_CUSTOMER_FIELDS: WebsiteLegalCustomerTextField[] = [
  'company_name',
  'legal_name',
  'tax_id',
  'address',
  'bank_details',
  'authorized_person',
  'phone',
  'email',
]

function normalizeOfficialName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru')
}

function parseLegalCustomer(input: unknown): WebsiteLegalCustomerInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new WebsiteCorporateCheckoutError('Для corporate обязателен объект legalCustomer', 400)
  }

  const source = input as Record<string, unknown>
  const result = {} as Omit<WebsiteLegalCustomerInput, 'authority_confirmed'>
  for (const field of REQUIRED_LEGAL_CUSTOMER_FIELDS) {
    const value = typeof source[field] === 'string' ? source[field].trim() : ''
    if (!value) {
      throw new WebsiteCorporateCheckoutError(`Поле legalCustomer.${field} обязательно`, 400)
    }
    result[field] = value
  }

  if (!/^\d{9}$/.test(result.tax_id)) {
    throw new WebsiteCorporateCheckoutError('legalCustomer.tax_id должен содержать ровно 9 цифр', 400)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) {
    throw new WebsiteCorporateCheckoutError('legalCustomer.email имеет некорректный формат', 400)
  }
  if (result.phone.replace(/\D/g, '').length < 7) {
    throw new WebsiteCorporateCheckoutError('legalCustomer.phone имеет некорректный формат', 400)
  }
  if (!/^IBAN:\s*BY\d{2}[A-Z0-9]{24}\s*$/imu.test(result.bank_details)) {
    throw new WebsiteCorporateCheckoutError('legalCustomer.bank_details не содержит корректный IBAN', 400)
  }
  if (!/^Банк:\s*\S.+$/imu.test(result.bank_details)) {
    throw new WebsiteCorporateCheckoutError('legalCustomer.bank_details не содержит название банка', 400)
  }
  if (!/^БИК:\s*[A-Z0-9]{8}(?:[A-Z0-9]{3})?\s*$/imu.test(result.bank_details)) {
    throw new WebsiteCorporateCheckoutError('legalCustomer.bank_details не содержит корректный БИК', 400)
  }
  if (!/^Адрес банка:\s*\S.+$/imu.test(result.bank_details)) {
    throw new WebsiteCorporateCheckoutError('legalCustomer.bank_details не содержит адрес банка', 400)
  }
  if (!/^.+,\s*действует на основании:\s*\S.+$/iu.test(result.authorized_person)) {
    throw new WebsiteCorporateCheckoutError(
      'legalCustomer.authorized_person должен содержать ФИО и основание полномочий',
      400,
    )
  }
  if (source.authority_confirmed !== true) {
    throw new WebsiteCorporateCheckoutError(
      'Не подтверждено право действовать от имени плательщика',
      400,
    )
  }
  return { ...result, authority_confirmed: true }
}

export async function validateWebsiteCorporateCheckout(
  legalCustomerInput: unknown,
  lookup: (unp: string) => Promise<TaxpayerRegistryDto> = (unp) =>
    taxpayerRegistryService.lookup(unp),
): Promise<{ legalCustomer: WebsiteLegalCustomerInput; taxpayer: TaxpayerRegistryDto }> {
  const legalCustomer = parseLegalCustomer(legalCustomerInput)

  let taxpayer: TaxpayerRegistryDto
  try {
    taxpayer = await lookup(legalCustomer.tax_id)
  } catch (error) {
    if (error instanceof TaxpayerRegistryError) {
      throw new WebsiteCorporateCheckoutError(error.message, error.status)
    }
    throw error
  }

  if (!taxpayer.isActive) {
    throw new WebsiteCorporateCheckoutError('Плательщик с указанным УНП не является действующим', 422)
  }
  if (!taxpayer.fullName) {
    throw new WebsiteCorporateCheckoutError('В ГРП МНС отсутствует полное наименование плательщика', 502)
  }

  const expectedCompanyName = taxpayer.shortName || taxpayer.fullName
  if (normalizeOfficialName(legalCustomer.legal_name) !== normalizeOfficialName(taxpayer.fullName)) {
    throw new WebsiteCorporateCheckoutError(
      'legalCustomer.legal_name не соответствует официальному наименованию ГРП МНС',
      400,
    )
  }
  if (normalizeOfficialName(legalCustomer.company_name) !== normalizeOfficialName(expectedCompanyName)) {
    throw new WebsiteCorporateCheckoutError(
      'legalCustomer.company_name не соответствует официальному наименованию ГРП МНС',
      400,
    )
  }

  return { legalCustomer, taxpayer }
}
