import { planConfirmWebsitePrepaymentSeal } from '../utils/confirmWebsitePrepaymentSeal'

describe('planConfirmWebsitePrepaymentSeal', () => {
  it('allows first successful confirm on unpaid order', () => {
    expect(
      planConfirmWebsitePrepaymentSeal({
        prepaymentStatus: 'pending',
        storedPaymentId: 'tok-1',
        incomingPaymentId: 'tok-1',
      }),
    ).toEqual({ sealed: false })
  })

  it('seals Issue paymentId even when status already paid', () => {
    expect(
      planConfirmWebsitePrepaymentSeal({
        prepaymentStatus: 'paid',
        storedPaymentId: 'ISSUE-123-9',
        incomingPaymentId: 'bepaid-late',
      }),
    ).toEqual({ sealed: true, reason: 'issued' })
  })

  it('seals debt_closed regardless of paymentId', () => {
    expect(
      planConfirmWebsitePrepaymentSeal({
        prepaymentStatus: 'paid',
        storedPaymentId: null,
        incomingPaymentId: 'bepaid-late',
        hasDebtClosedEvent: true,
      }),
    ).toEqual({ sealed: true, reason: 'issued' })
  })

  it('seals offline-paid (cleared paymentId) against late confirm', () => {
    expect(
      planConfirmWebsitePrepaymentSeal({
        prepaymentStatus: 'paid',
        storedPaymentId: null,
        incomingPaymentId: 'bepaid-late',
      }),
    ).toEqual({ sealed: true, reason: 'already_paid' })
  })

  it('allows idempotent retry with the same paymentId', () => {
    expect(
      planConfirmWebsitePrepaymentSeal({
        prepaymentStatus: 'paid',
        storedPaymentId: 'tok-same',
        incomingPaymentId: 'tok-same',
      }),
    ).toEqual({ sealed: false })
  })

  it('seals paid order when incoming paymentId differs', () => {
    expect(
      planConfirmWebsitePrepaymentSeal({
        prepaymentStatus: 'paid',
        storedPaymentId: 'tok-old',
        incomingPaymentId: 'tok-new',
      }),
    ).toEqual({ sealed: true, reason: 'already_paid' })
  })
})
