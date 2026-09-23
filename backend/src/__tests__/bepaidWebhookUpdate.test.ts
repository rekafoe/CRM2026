import { planBePaidWebhookStatusUpdate } from '../utils/bepaidWebhookUpdate'

describe('planBePaidWebhookStatusUpdate', () => {
  it('does not downgrade paid → pending (remainder checkout / delayed incomplete)', () => {
    expect(planBePaidWebhookStatusUpdate('paid', 'pending')).toEqual({
      action: 'noop_keep_paid',
    })
  })

  it('does not downgrade successful → failed (abandoned follow-up checkout)', () => {
    expect(planBePaidWebhookStatusUpdate('successful', 'failed')).toEqual({
      action: 'noop_keep_paid',
    })
  })

  it('still applies paid on top of paid (idempotent / accumulate path applies separately)', () => {
    expect(planBePaidWebhookStatusUpdate('paid', 'paid')).toEqual({
      action: 'apply',
      status: 'paid',
    })
  })

  it('applies pending and failed for unpaid / pending orders', () => {
    expect(planBePaidWebhookStatusUpdate('pending', 'pending')).toEqual({
      action: 'apply',
      status: 'pending',
    })
    expect(planBePaidWebhookStatusUpdate(null, 'failed')).toEqual({
      action: 'apply',
      status: 'failed',
    })
    expect(planBePaidWebhookStatusUpdate('failed', 'paid')).toEqual({
      action: 'apply',
      status: 'paid',
    })
  })
})
