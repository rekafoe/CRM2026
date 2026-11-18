import { resolveInvoiceIssueSettlement } from '../utils/invoiceIssueCash'
import { getLegalLedger } from '../services/legalLedgerService'

jest.mock('../services/legalLedgerService', () => ({
  getLegalLedger: jest.fn(),
}))

const mockedLedger = getLegalLedger as jest.MockedFunction<typeof getLegalLedger>

describe('resolveInvoiceIssueSettlement', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('skips seal for unpaid invoice without looking up ledger (d7bea51b)', async () => {
    const result = await resolveInvoiceIssueSettlement(
      {
        id: 1,
        payment_channel: 'invoice',
        prepaymentAmount: null,
        prepaymentStatus: null,
        customer_id: 9,
      },
      100,
    )
    expect(result).toEqual({ skipOfflineSeal: true, remainder: 0 })
    expect(mockedLedger).not.toHaveBeenCalled()
  })

  it('skips seal and cash when partial bank + legal_payments already settle the entity', async () => {
    mockedLedger.mockResolvedValue({
      manager_name: null,
      balance: 0,
      debit_total: 100,
      credit_total: 100,
      order: { included: true, debit: 100, collected: 40, skip: null },
      last_document: null,
      payments: [],
    })

    const result = await resolveInvoiceIssueSettlement(
      {
        id: 42,
        payment_channel: 'invoice',
        prepaymentAmount: 40,
        prepaymentStatus: 'bank',
        paymentMethod: 'online',
        customer_id: 9,
      },
      100,
    )

    expect(result).toEqual({ skipOfflineSeal: true, remainder: 0 })
    expect(mockedLedger).toHaveBeenCalledWith(9, 42)
  })

  it('keeps cash remainder when invoice entity still has open balance', async () => {
    mockedLedger.mockResolvedValue({
      manager_name: null,
      balance: 60,
      debit_total: 100,
      credit_total: 40,
      order: { included: true, debit: 100, collected: 40, skip: null },
      last_document: null,
      payments: [],
    })

    const result = await resolveInvoiceIssueSettlement(
      {
        id: 42,
        payment_channel: 'invoice',
        prepaymentAmount: 40,
        prepaymentStatus: 'bank',
        paymentMethod: 'online',
        customer_id: 9,
      },
      100,
    )

    expect(result).toEqual({ skipOfflineSeal: false, remainder: 60 })
  })

  it('does not consult ledger for cash-channel orders', async () => {
    const result = await resolveInvoiceIssueSettlement(
      {
        id: 7,
        payment_channel: 'cash',
        prepaymentAmount: 40,
        prepaymentStatus: 'paid',
        paymentMethod: 'offline',
        customer_id: 9,
      },
      100,
    )
    expect(result).toEqual({ skipOfflineSeal: false, remainder: 60 })
    expect(mockedLedger).not.toHaveBeenCalled()
  })
})
