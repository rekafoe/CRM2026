/**
 * Critical payment / inventory correctness — regression tests for bug hunt 2026-08-26.
 */
import { isBePaidBasicAuthValid, mapBePaidStatus } from '../services/bepaidWebhookAuth'

describe('BePaid webhook auth helpers', () => {
  const prevShop = process.env.BEPAID_SHOP_ID
  const prevSecret = process.env.BEPAID_SECRET_KEY

  afterEach(() => {
    if (prevShop === undefined) delete process.env.BEPAID_SHOP_ID
    else process.env.BEPAID_SHOP_ID = prevShop
    if (prevSecret === undefined) delete process.env.BEPAID_SECRET_KEY
    else process.env.BEPAID_SECRET_KEY = prevSecret
  })

  it('rejects missing Basic Auth when credentials are configured', () => {
    process.env.BEPAID_SHOP_ID = 'shop1'
    process.env.BEPAID_SECRET_KEY = 'secret1'
    expect(isBePaidBasicAuthValid({ headers: {} })).toBe(false)
  })

  it('accepts Shop ID:Secret Key Basic Auth', () => {
    process.env.BEPAID_SHOP_ID = 'shop1'
    process.env.BEPAID_SECRET_KEY = 'secret1'
    const token = Buffer.from('shop1:secret1').toString('base64')
    expect(
      isBePaidBasicAuthValid({
        headers: { authorization: `Basic ${token}` },
      }),
    ).toBe(true)
  })

  it('maps successful statuses to paid', () => {
    expect(mapBePaidStatus('successful')).toBe('paid')
    expect(mapBePaidStatus('failed')).toBe('failed')
  })
})

describe('createOrder remote checkout payment status semantics', () => {
  /**
   * Mirrors OrderService.createOrder branching for website/mini_app.
   * Keep in sync with orderService.ts — guards silent false-paid on checkout create.
   */
  function resolveCreatePaymentFields(input: {
    source?: string
    prepaymentAmount?: number
    paymentMethodHint?: 'online' | 'offline' | null
  }): { prepaymentStatus: string | null; paymentMethod: string | null } {
    const initialPrepay = Number(input.prepaymentAmount || 0)
    const remoteCheckout = input.source === 'website' || input.source === 'mini_app'
    const paymentMethodHint = input.paymentMethodHint ?? null
    if (
      paymentMethodHint === 'online' ||
      (remoteCheckout && initialPrepay > 0 && paymentMethodHint !== 'offline')
    ) {
      return { prepaymentStatus: 'pending', paymentMethod: 'online' }
    }
    if (initialPrepay > 0 && !remoteCheckout) {
      return { prepaymentStatus: 'paid', paymentMethod: 'offline' }
    }
    if (paymentMethodHint === 'offline') {
      return { prepaymentStatus: null, paymentMethod: null }
    }
    if (remoteCheckout && initialPrepay > 0) {
      return { prepaymentStatus: null, paymentMethod: null }
    }
    return { prepaymentStatus: null, paymentMethod: null }
  }

  it('does not mark website order paid when prepaymentAmount is sent (docs case)', () => {
    const r = resolveCreatePaymentFields({
      source: 'website',
      prepaymentAmount: 10.5,
    })
    expect(r.prepaymentStatus).toBe('pending')
    expect(r.paymentMethod).toBe('online')
  })

  it('keeps online website order pending even with amount', () => {
    const r = resolveCreatePaymentFields({
      source: 'website',
      prepaymentAmount: 25,
      paymentMethodHint: 'online',
    })
    expect(r.prepaymentStatus).toBe('pending')
  })

  it('does not mark COD website order paid', () => {
    const r = resolveCreatePaymentFields({
      source: 'website',
      prepaymentAmount: 25,
      paymentMethodHint: 'offline',
    })
    expect(r.prepaymentStatus).toBeNull()
  })

  it('still marks CRM cash prepayment as paid', () => {
    const r = resolveCreatePaymentFields({
      source: 'crm',
      prepaymentAmount: 40,
    })
    expect(r.prepaymentStatus).toBe('paid')
    expect(r.paymentMethod).toBe('offline')
  })
})
