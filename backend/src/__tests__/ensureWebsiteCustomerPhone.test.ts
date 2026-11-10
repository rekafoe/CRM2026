import { getDb } from '../config/database'
import { CustomerService } from '../modules/customers/services/customerService'
import { ensureWebsiteCustomer } from '../services/editorDraftOwnerService'

jest.mock('../config/database', () => ({
  getDb: jest.fn(),
}))

jest.mock('../modules/customers/services/customerService', () => ({
  CustomerService: {
    createCustomer: jest.fn(),
    updateCustomer: jest.fn(),
  },
}))

describe('ensureWebsiteCustomer phone match', () => {
  const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>
  const mockedCreate = CustomerService.createCustomer as jest.MockedFunction<
    typeof CustomerService.createCustomer
  >

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('finds an existing customer by digit-normalized phone via SQL (no LIMIT 500 scan)', async () => {
    const get = jest.fn()
      .mockResolvedValueOnce({ id: 12 }) // phone match
    mockedGetDb.mockResolvedValue({ get, all: jest.fn() } as any)

    await expect(
      ensureWebsiteCustomer({ phone: '+375 (29) 111-22-33', name: 'Иван' }),
    ).resolves.toEqual({ id: 12 })

    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('replace(replace(replace'),
      ['375291112233'],
    )
    expect(String(get.mock.calls[0][0])).not.toContain('LIMIT 500')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('creates a customer when phone digits are unknown', async () => {
    const get = jest.fn()
      .mockResolvedValueOnce(undefined) // phone miss
    mockedGetDb.mockResolvedValue({ get, all: jest.fn() } as any)
    mockedCreate.mockResolvedValue({ id: 99 } as any)

    await expect(
      ensureWebsiteCustomer({ phone: '+375291000000', email: 'a@b.by', name: 'Пётр Сидоров' }),
    ).resolves.toEqual({ id: 99 })

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'individual',
        first_name: 'Пётр',
        last_name: 'Сидоров',
        phone: '+375291000000',
        email: 'a@b.by',
        source: 'website',
      }),
    )
  })
})
