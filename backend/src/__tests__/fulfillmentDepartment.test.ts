import {
  parseWebsiteOrderDelivery,
  serializeWebsiteOrderDelivery,
} from '../types/websiteOrderDelivery'

describe('fulfillmentDepartment resolve', () => {
  it('pickup delivery serializes with providerId for department code match', () => {
    const d = parseWebsiteOrderDelivery({
      kind: 'pickup',
      providerId: 'pickup-gikalo',
      label: 'Проспект Дзержинского 3б',
      address: 'г. Минск, пр. Дзержинского 3б',
      cost: 0,
    })
    expect(d?.kind).toBe('pickup')
    expect(d?.providerId).toBe('pickup-gikalo')
    const json = serializeWebsiteOrderDelivery(d!)
    expect(json).toContain('pickup-gikalo')
  })
})
