import { resolveBePaidPaidAmount } from '../utils/bepaidPaidAmount'

describe('resolveBePaidPaidAmount', () => {
  it('uses gateway amount for first successful payment', () => {
    expect(
      resolveBePaidPaidAmount({
        existingPrepay: 0,
        amountByn: 100,
        alreadyPaid: false,
        existingPaymentId: null,
        incomingPaymentId: 'uid-1',
      }),
    ).toBe(100)
  })

  it('does not shrink prepaid when a smaller remainder webhook arrives without additive id', () => {
    // already paid offline 100; remainder checkout token was stored as paymentId;
    // BePaid uid differs → additive
    expect(
      resolveBePaidPaidAmount({
        existingPrepay: 100,
        amountByn: 50,
        alreadyPaid: true,
        existingPaymentId: 'checkout-token',
        incomingPaymentId: 'uid-remainder',
      }),
    ).toBe(150)
  })

  it('is idempotent when the same payment uid is replayed', () => {
    expect(
      resolveBePaidPaidAmount({
        existingPrepay: 150,
        amountByn: 50,
        alreadyPaid: true,
        existingPaymentId: 'uid-remainder',
        incomingPaymentId: 'uid-remainder',
      }),
    ).toBe(150)
  })

  it('keeps existing when paid webhook has no amount', () => {
    expect(
      resolveBePaidPaidAmount({
        existingPrepay: 80,
        amountByn: 0,
        alreadyPaid: true,
        existingPaymentId: 'uid-1',
        incomingPaymentId: 'uid-2',
      }),
    ).toBe(80)
  })
})
