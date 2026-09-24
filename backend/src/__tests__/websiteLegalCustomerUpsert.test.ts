import { getDb } from '../config/database'
import { CustomerService } from '../modules/customers/services/customerService'
import { ensureWebsiteLegalCustomer } from '../services/editorDraftOwnerService'

jest.mock('../config/database', () => ({
  getDb: jest.fn(),
}))

jest.mock('../modules/customers/services/customerService', () => ({
  CustomerService: {
    createCustomer: jest.fn(),
    updateCustomer: jest.fn(),
  },
}))

const input = {
  company_name: 'ООО Тест',
  legal_name: 'Общество с ограниченной ответственностью Тест',
  tax_id: '190000001',
  address: 'г. Минск',
  bank_details:
    'IBAN: BY86AKBB36429000000000000000\nБанк: ОАО АСБ Беларусбанк\nБИК: AKBBBY2X\nАдрес банка: г. Минск',
  authorized_person: 'Иванов И.И., действует на основании: Устава',
  phone: '+375291234567',
  email: 'OFFICE@EXAMPLE.BY',
  authority_confirmed: true as const,
}

describe('ensureWebsiteLegalCustomer', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>
  const mockedCreate = CustomerService.createCustomer as jest.MockedFunction<
    typeof CustomerService.createCustomer
  >
  const mockedUpdate = CustomerService.updateCustomer as jest.MockedFunction<
    typeof CustomerService.updateCustomer
  >

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('links an existing legal customer by tax_id without overwriting bank details', async () => {
    const get = jest.fn().mockResolvedValue({ id: 42 })
    mockedGetDb.mockResolvedValue({ get } as any)

    await expect(ensureWebsiteLegalCustomer(input)).resolves.toEqual({ id: 42 })
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining("WHERE type = 'legal' AND TRIM(tax_id) = ?"),
      ['190000001'],
    )
    expect(mockedUpdate).not.toHaveBeenCalled()
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('creates a website legal customer without searching by phone', async () => {
    const get = jest.fn().mockResolvedValue(undefined)
    mockedGetDb.mockResolvedValue({ get } as any)
    mockedCreate.mockResolvedValue({ id: 77 } as any)

    await expect(ensureWebsiteLegalCustomer(input)).resolves.toEqual({ id: 77 })
    expect(String(get.mock.calls[0][0])).not.toContain('phone')
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'legal',
        source: 'website',
        tax_id: '190000001',
        email: 'office@example.by',
      }),
    )
    expect(mockedUpdate).not.toHaveBeenCalled()
  })
})
