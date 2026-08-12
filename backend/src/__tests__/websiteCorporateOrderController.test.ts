import { OrderController } from '../modules/orders/controllers/orderController'
import { OrderService } from '../modules/orders/services/orderService'
import {
  ensureWebsiteLegalCustomer,
} from '../services/editorDraftOwnerService'
import {
  validateWebsiteCorporateCheckout,
} from '../services/websiteCorporateCheckoutService'

jest.mock('../modules/orders/services/orderService', () => ({
  OrderService: {
    createOrderWithAutoDeduction: jest.fn(),
    createOrder: jest.fn(),
  },
}))

jest.mock('../services/editorDraftOwnerService', () => ({
  ensureWebsiteCustomer: jest.fn(),
  ensureWebsiteLegalCustomer: jest.fn(),
}))

jest.mock('../services/websiteCorporateCheckoutService', () => {
  const actual = jest.requireActual('../services/websiteCorporateCheckoutService')
  return {
    ...actual,
    validateWebsiteCorporateCheckout: jest.fn(),
  }
})

jest.mock('../services/editorDraftWebsitePrepare', () => ({
  prepareWebsiteItemsWithEditorDrafts: jest.fn(async (items: unknown[]) => ({
    items,
    editorDraftItems: [],
  })),
  attachEditorDraftsToOrderItems: jest.fn(),
}))

jest.mock('../services/editorOrderIntakeService', () => ({
  completeEditorOrderIntake: jest.fn(),
}))

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

const legalCustomer = {
  company_name: 'МНС',
  legal_name: 'Министерство по налогам и сборам Республики Беларусь',
  tax_id: '100582333',
  address: 'г. Минск',
  bank_details:
    'IBAN: BY86AKBB36429000000000000000\nБанк: ОАО АСБ Беларусбанк\nБИК: AKBBBY2X\nАдрес банка: г. Минск',
  authorized_person: 'Иванов И.И., действует на основании: Устава',
  phone: '+375291234567',
  email: 'accounting@example.by',
  authority_confirmed: true as const,
}

function responseMock() {
  const res: any = {
    status: jest.fn(),
    json: jest.fn(),
  }
  res.status.mockReturnValue(res)
  return res
}

describe('corporate website order controller', () => {
  const createWithItems = OrderService.createOrderWithAutoDeduction as jest.MockedFunction<
    typeof OrderService.createOrderWithAutoDeduction
  >
  const validateCorporate = validateWebsiteCorporateCheckout as jest.MockedFunction<
    typeof validateWebsiteCorporateCheckout
  >
  const ensureLegal = ensureWebsiteLegalCustomer as jest.MockedFunction<
    typeof ensureWebsiteLegalCustomer
  >

  beforeEach(() => {
    jest.clearAllMocks()
    validateCorporate.mockResolvedValue({
      legalCustomer,
      taxpayer: {
        unp: legalCustomer.tax_id,
        fullName: legalCustomer.legal_name,
        shortName: legalCustomer.company_name,
        address: legalCustomer.address,
        registrationDate: null,
        taxOfficeCode: null,
        taxOfficeName: null,
        statusCode: '1',
        statusLabel: 'Действующий',
        isActive: true,
      },
    })
    ensureLegal.mockResolvedValue({ id: 42 })
    createWithItems.mockResolvedValue({
      order: { id: 10, number: 'ORD-0010' } as any,
      deductionResult: { success: true, errors: [] } as any,
      itemIds: [100],
    })
  })

  it('forces invoice, zero prepayment and the legal customer id', async () => {
    const req: any = {
      body: {
        paymentMethod: 'corporate',
        payment_channel: 'cash',
        prepaymentAmount: 999,
        customer_id: 777,
        legalCustomer,
        items: [{ type: '58', params: {}, price: 10, quantity: 1 }],
      },
    }
    const res = responseMock()

    await OrderController.createOrderFromWebsite(req, res)

    expect(createWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: legalCustomer.company_name,
        customer_id: 42,
        prepaymentAmount: 0,
        paymentChannel: 'invoice',
        paymentMethod: 'offline',
        source: 'website',
      }),
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('does not accept an arbitrary invoice channel for a non-corporate order', async () => {
    const req: any = {
      body: {
        paymentMethod: 'offline',
        payment_channel: 'invoice',
        customerName: 'Иван',
        customer_id: 5,
        items: [{ type: '58', params: {}, price: 10, quantity: 1 }],
      },
    }
    const res = responseMock()

    await OrderController.createOrderFromWebsite(req, res)

    expect(createWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: 5,
        paymentChannel: undefined,
        paymentMethod: 'offline',
      }),
    )
  })

  it('preserves the existing online payment flow', async () => {
    const req: any = {
      body: {
        paymentMethod: 'online',
        customerName: 'Иван',
        customer_id: 5,
        prepaymentAmount: 12.5,
        items: [{ type: '58', params: {}, price: 10, quantity: 1 }],
      },
    }
    const res = responseMock()

    await OrderController.createOrderFromWebsite(req, res)

    expect(createWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: 5,
        prepaymentAmount: 12.5,
        paymentChannel: undefined,
        paymentMethod: 'online',
      }),
    )
  })
})
