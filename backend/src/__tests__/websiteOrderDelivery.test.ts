import {
  formatWebsiteDeliverySummary,
  parseWebsiteOrderDelivery,
  parseWebsiteOrderDeliveryJson,
} from '../types/websiteOrderDelivery'

describe('websiteOrderDelivery', () => {
  it('parses valid delivery', () => {
    const d = parseWebsiteOrderDelivery({
      kind: 'pickup',
      providerId: 'pickup-dzerzhinsky-3b',
      label: 'Проспект Дзержинского 3б',
      cost: 0,
    })
    expect(d?.providerId).toBe('pickup-dzerzhinsky-3b')
    expect(formatWebsiteDeliverySummary(d!)).toContain('Самовывоз')
  })

  it('rejects incomplete delivery', () => {
    expect(parseWebsiteOrderDelivery({ kind: 'pickup' })).toBeNull()
  })

  it('round-trips JSON', () => {
    const raw = {
      kind: 'pickup_point',
      providerId: 'evropochta',
      label: 'Европочта',
      costLabel: 'от 6р',
    }
    const parsed = parseWebsiteOrderDeliveryJson(JSON.stringify(raw))
    expect(parsed?.kind).toBe('pickup_point')
  })
})
